import * as core from '@actions/core'
import * as exec from '@actions/exec'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

type Inputs = {
  executor: string
  cache: boolean
  cacheRepository: string
  cacheTTL: string
  pushRetry: string
  registryMirrors: string[]
  verbosity: string
  kanikoArgs: string[]
  buildArgs: string[]
  context: string
  file: string
  labels: string[]
  push: boolean
  tags: string[]
  target: string
  runArgs: string[]
  tarPath: string
}

type Outputs = {
  digest: string
  outputsDirectory: string
  tarPathWithoutPrefix: string
}

export const run = async (inputs: Inputs): Promise<Outputs> => {
  await core.group(`Pulling ${inputs.executor}`, () =>
    withTime('Pulled', () => exec.exec('docker', ['pull', '-q', inputs.executor])),
  )

  const runnerTempDir = process.env.RUNNER_TEMP || os.tmpdir()
  const outputsDir = await fs.mkdtemp(path.join(runnerTempDir, 'kaniko-action-'))
  const args = generateArgs(inputs, outputsDir)
  await withTime('Built', () => exec.exec('docker', args))

  const digest = await readContent(`${outputsDir}/digest`)
  const outputsDirectory = outputsDir

  const tarPathWithoutPrefix = inputs.tarPath
    ? ''
    : (() => {
        const { found, tarPathWithoutPrefix } = checkTarPathInArgs(inputs.tarPath, args)
        if (!found) {
          const errorMessage = `Cannot find the tar-path ${inputs.tarPath} in the arguments.
      Mount the tar-path directory to the container manually using run-args
      or provide the relative tar-path.`
          core.setFailed(errorMessage)
          throw new Error(errorMessage)
        }
        return tarPathWithoutPrefix
      })()

  core.info(digest)
  core.info(outputsDirectory)
  core.info(tarPathWithoutPrefix)
  await Promise.all(dirs.map(changeOwnership))

  return { digest, outputsDirectory, tarPathWithoutPrefix }
}

const withTime = async <T>(message: string, f: () => Promise<T>): Promise<T> => {
  const start = Date.now()
  const value = await f()
  const end = Date.now()
  const seconds = (end - start) / 1000
  core.info(`${message} in ${seconds}s`)
  return value
}

const githubWorkspace = process.env.GITHUB_WORKSPACE || '/tmp/github/workspace'

export const generateArgs = (inputs: Inputs, outputsDir: string): string[] => {
  const args = [
    // docker args
    'run',
    '--rm',
    '-v',
    `${path.resolve(inputs.context)}:/kaniko/action/context:ro`,
    '-v',
    `${outputsDir}:/kaniko/action/outputs`,
    '-v',
    `${os.homedir()}/.docker/:/kaniko/.docker/:ro`,
    '-v',
    `${path.resolve(githubWorkspace)}:/workspace`,
    '-v',
    `${path.resolve(githubWorkspace)}:/github/workspace`,
    // workaround for kaniko v1.8.0+
    // https://github.com/GoogleContainerTools/kaniko/issues/1542#issuecomment-1066028047
    '-e',
    'container=docker',
    ...inputs.runArgs.flatMap((arg) => arg.split(' ')),
    inputs.executor,
    // kaniko args
    '--context',
    'dir:///kaniko/action/context/',
    '--digest-file',
    '/kaniko/action/outputs/digest',
  ]

  if (inputs.file) {
    // docker build command resolves the Dockerfile from the context root
    // https://docs.docker.com/engine/reference/commandline/build/#specify-a-dockerfile--f
    const dockerfileInContext = path.relative(inputs.context, inputs.file)
    args.push('--dockerfile', dockerfileInContext)
  }
  for (const buildArg of inputs.buildArgs) {
    args.push('--build-arg', buildArg)
  }
  for (const label of inputs.labels) {
    args.push('--label', label)
  }
  if (!inputs.push) {
    args.push('--no-push')
  }
  for (const tag of inputs.tags) {
    args.push('--destination', tag)
  }
  if (inputs.target) {
    args.push('--target', inputs.target)
  }

  if (inputs.cache) {
    args.push('--cache=true')
    if (inputs.cacheRepository) {
      args.push('--cache-repo', inputs.cacheRepository)
    }
  }
  if (inputs.cacheTTL) {
    args.push('--cache-ttl', inputs.cacheTTL)
  }
  if (inputs.pushRetry) {
    args.push('--push-retry', inputs.pushRetry)
  }
  for (const mirror of inputs.registryMirrors) {
    args.push('--registry-mirror', mirror)
  }
  if (inputs.verbosity) {
    args.push('--verbosity', inputs.verbosity)
  }
  if (inputs.tarPath) {
    args.push('--tar-path', inputs.tarPath)
  }

  args.push(...inputs.kanikoArgs)

  return args
}

const readContent = async (p: string) => (await fs.readFile(p)).toString().trim()

const changeOwnership = async (path: string) => {
  try {
    await exec.exec(`sudo chown -R runner:docker ${path}`)
  } catch (error) {
    core.info(`Cannot change ownership of ${path}: ${(error as Error).message}`)
  }
}

const checkTarPathInArgs = (tarPath: string, args: string[]): { found: boolean; tarPathWithoutPrefix: string } => {
  if (!path.isAbsolute(tarPath)) {
    return { found: false, tarPathWithoutPrefix: '' }
  }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-v') {
      const parts = args[i + 1].split(':')
      if (parts.length > 1 && tarPath.startsWith(parts[1])) {
        return { found: true, tarPathWithoutPrefix: tarPath.slice(parts[1].length) }
      }
    }
  }
  return { found: false, tarPathWithoutPrefix: '' }
}

const dirs = ['/kaniko/action/outputs', '/workspace', '/github/workspace']
