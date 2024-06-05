import * as os from 'os'
import { checkTarPathInArgs, generateArgs } from '../src/run.js'

const defaultInputs = {
  executor: 'gcr.io/kaniko-project/executor:latest',
  cache: false,
  cacheRepository: '',
  cacheTTL: '',
  pushRetry: '',
  registryMirrors: [],
  verbosity: '',
  runArgs: [],
  kanikoArgs: [],
  buildArgs: [],
  context: '',
  file: '',
  labels: [],
  push: false,
  tags: [],
  target: '',
  tarPath: '',
}

test('default args', () => {
  const args = generateArgs(defaultInputs, '/tmp/kaniko-action')
  expect(args).toStrictEqual([
    // docker args
    'run',
    '--rm',
    '-v',
    `${process.cwd()}:/kaniko/action/context:ro`,
    '-v',
    `/tmp/kaniko-action:/kaniko/action/outputs`,
    '-v',
    `${os.homedir()}/.docker/:/kaniko/.docker/:ro`,
    '-v',
    `/tmp/github/workspace:/workspace`,
    '-v',
    `/tmp/github/workspace:/github/workspace`,
    '-e',
    'container=docker',
    'gcr.io/kaniko-project/executor:latest',
    // kaniko args
    '--context',
    'dir:///kaniko/action/context/',
    '--digest-file',
    '/kaniko/action/outputs/digest',
    '--no-push',
  ])
})

test('full args', () => {
  const args = generateArgs(
    {
      executor: 'gcr.io/kaniko-project/executor:latest',
      cache: true,
      cacheRepository: 'ghcr.io/int128/kaniko-action/cache',
      cacheTTL: '30d',
      pushRetry: '100',
      registryMirrors: ['mirror.example.com', 'mirror.gcr.io'],
      verbosity: 'debug',
      runArgs: ['--arg1', '--arg2'],
      kanikoArgs: ['--skip-tls-verify', '--help'],
      buildArgs: ['foo=1', 'bar=2'],
      context: 'foo/bar',
      file: 'foo/bar/baz/my.Dockerfile',
      labels: ['org.opencontainers.image.description=foo', 'org.opencontainers.image.url=https://www.example.com'],
      push: false,
      tags: ['helloworld:latest', 'ghcr.io/int128/kaniko-action/example:v1.0.0'],
      target: 'server',
      tarPath: '/workspace/output.tar',
    },
    '/tmp/kaniko-action',
  )
  expect(args).toStrictEqual([
    // docker args
    'run',
    '--rm',
    '-v',
    `${process.cwd()}/foo/bar:/kaniko/action/context:ro`,
    '-v',
    `/tmp/kaniko-action:/kaniko/action/outputs`,
    '-v',
    `${os.homedir()}/.docker/:/kaniko/.docker/:ro`,
    '-v',
    `/tmp/github/workspace:/workspace`,
    '-v',
    `/tmp/github/workspace:/github/workspace`,
    '-e',
    'container=docker',
    '--arg1',
    '--arg2',
    'gcr.io/kaniko-project/executor:latest',
    // kaniko args
    '--context',
    'dir:///kaniko/action/context/',
    '--digest-file',
    '/kaniko/action/outputs/digest',
    '--dockerfile',
    'baz/my.Dockerfile',
    '--build-arg',
    'foo=1',
    '--build-arg',
    'bar=2',
    '--label',
    'org.opencontainers.image.description=foo',
    '--label',
    'org.opencontainers.image.url=https://www.example.com',
    '--no-push',
    '--destination',
    'helloworld:latest',
    '--destination',
    'ghcr.io/int128/kaniko-action/example:v1.0.0',
    '--target',
    'server',
    '--cache=true',
    '--cache-repo',
    'ghcr.io/int128/kaniko-action/cache',
    '--cache-ttl',
    '30d',
    '--push-retry',
    '100',
    '--registry-mirror',
    'mirror.example.com',
    '--registry-mirror',
    'mirror.gcr.io',
    '--verbosity',
    'debug',
    '--tar-path',
    '/workspace/output.tar',
    '--skip-tls-verify',
    '--help',
  ])
})

test('with dockerfile', () => {
  const args = generateArgs(
    {
      ...defaultInputs,
      file: 'my.Dockerfile',
    },
    '/tmp/kaniko-action',
  )
  expect(args).toStrictEqual([
    // docker args
    'run',
    '--rm',
    '-v',
    `${process.cwd()}:/kaniko/action/context:ro`,
    '-v',
    `/tmp/kaniko-action:/kaniko/action/outputs`,
    '-v',
    `${os.homedir()}/.docker/:/kaniko/.docker/:ro`,
    '-v',
    `/tmp/github/workspace:/workspace`,
    '-v',
    `/tmp/github/workspace:/github/workspace`,
    '-e',
    'container=docker',
    'gcr.io/kaniko-project/executor:latest',
    // kaniko args
    '--context',
    'dir:///kaniko/action/context/',
    '--digest-file',
    '/kaniko/action/outputs/digest',
    '--dockerfile',
    'my.Dockerfile',
    '--no-push',
  ])
})

test('output tar-path-without-prefix', () => {
  let tarPathWithoutPrefix = ''
  const inputs = {
    ...defaultInputs,
    tarPath: '/workspace/output.tar',
  }

  const args = generateArgs(inputs, '/tmp/kaniko-action')

  if (inputs.tarPath) {
    const { found, tarPathWithoutPrefix: tpwp } = checkTarPathInArgs(inputs.tarPath, args)
    if (found) {
      tarPathWithoutPrefix = tpwp
    }
  }
  expect(tarPathWithoutPrefix).toBe('output.tar')
})
