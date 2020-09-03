const moment = require('moment')
const Redis = require('ioredis')

const _s3FileSizeTracer = (fileContent) => {
  const contentByteSize = Buffer.byteLength(JSON.stringify(fileContent), 'utf8')
  const s3ContentKiloByteSize = contentByteSize / 1024

  console.log('+++s3ContentKiloByteSize', s3ContentKiloByteSize)

  return s3ContentKiloByteSize
}

module.exports = class AWSTracer {
  constructor(process) {
    const {
      REDIS_HOST,
      REDIS_PORT,
      REDIS_PASSWORD,
      REDIS_CONNECTION,
    } = process.env

    console.log('+++process.env', process.env)

    this.tracerStore = REDIS_CONNECTION
      ? new Redis(REDIS_CONNECTION)
      : new Redis({
        port: REDIS_PORT, // Redis port
        host: REDIS_HOST, // Redis host
        family: 4, // 4 (IPv4) or 6 (IPv6)
        password: REDIS_PASSWORD,
        db: 0,
      })

    this.jobId = null

    this.lambdaTraceInfo = {
      lambdaStartTime: null,
      lambdaMemoryAllocationInMB: null,
    }

    this.currentRunningProcess = process
  }

  // **********
  // LAMBDA

  // use in Lambda as early as possible
  startLambdaTracer(event, context) {
    this.lambdaTraceInfo.lambdaStartTime = moment.utc().valueOf()
    this.lambdaTraceInfo.lambdaMemoryAllocationInMB = context.memoryLimitInMB

    console.log('+++redis lambdaStartTime', this.lambdaTraceInfo.lambdaStartTime)

    console.log('+++event.body', event)
    console.log('+++event.body', event.body)

    // event object might be different from http request or lambda invocation
    if (event.body) {
      const eventBody = JSON.parse(event.body)
      this.jobId = eventBody.jobId
    } else {
      this.jobId = event.jobId
    }

    console.log('+++this.jobId', this.jobId)

    // console.log('+++ STOP HERE1')
    // this.currentRunningProcess.exit()
    // console.log('+++ STOP HERE2')
  }

  async stopLambdaTracer() {
    console.log('+++redis stopLambdaTracer')
    const {
      lambdaMemoryAllocationInMB,
      lambdaStartTime,
    } = this.lambdaTraceInfo
    await this.tracerStore.set(`${this.jobId}-lambdaMemoryAllocationInMB`, lambdaMemoryAllocationInMB)
    await this.tracerStore.set(`${this.jobId}-lambdaStartTime`, lambdaStartTime)
  }
  // **********

  // **********
  // S3
  async getS3ObjectIsCalled() {
    console.log('+++redis getS3ObjectIsCalled')
    await this.tracerStore.incr(`${this.jobId}#s3#getObject`)
  }

  async putS3ObjectIsCalled(params) {
    console.log('+++redis putS3ObjectIsCalled')
    const fileContent = params.Body
    const fileSize = _s3FileSizeTracer(fileContent)
    await this.tracerStore.rpush(`${this.jobId}#s3#putObject`, fileSize)
  }
  // **********

  // **********
  // SQS
  async sendSqsMessageIsCalled() {
    console.log('+++redis sendSqsMessageIsCalled')
    await this.tracerStore.incr(`${this.jobId}#sqs#sendMessage`)
  }
  // **********
}
