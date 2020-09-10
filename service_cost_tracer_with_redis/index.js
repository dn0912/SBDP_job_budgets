const moment = require('moment')
const Redis = require('ioredis')

// Key format: tracer_{jobId}#{serviceType}#{serviceMethod}
const CACHE_KEY_PREFIX = 'tracer_'

const _s3FileSizeTracer = (fileContent) => {
  const contentByteSize = Buffer.byteLength(JSON.stringify(fileContent), 'utf8')
  const s3ContentKiloByteSize = contentByteSize / 1024

  console.log('+++s3ContentKiloByteSize+++', s3ContentKiloByteSize)

  return s3ContentKiloByteSize
}

const _sqsPayloadSizeTracer = (sqsPayload) => {
  const payloadByteSize = Buffer.byteLength(JSON.stringify(sqsPayload), 'utf8')
  const sqs64KiloByteChunkAmounts = Math.ceil(payloadByteSize / 1024 / 64)

  console.log('+++sqs64KiloByteChunkAmounts+++', sqs64KiloByteChunkAmounts)

  return sqs64KiloByteChunkAmounts
}

module.exports = class AWSTracer {
  constructor(process) {
    const {
      REDIS_HOST,
      REDIS_PORT,
      REDIS_PASSWORD,
      REDIS_CONNECTION,
    } = process.env

    console.log('+++process.env+++', process.env)

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

    console.log('+++redis lambdaStartTime+++', this.lambdaTraceInfo.lambdaStartTime)

    console.log('+++event.body+++', event)
    console.log('+++event.body+++', event.body)

    // event object might be different, depending on source which triggers lambda
    // from http request
    if (event.body) {
      // trigger from http request
      const eventBody = JSON.parse(event.body)
      this.jobId = eventBody.jobId
    } else if (event.Records) {
      // trigger sqs event
      const eventBody = JSON.parse(event.Records[0].body)
      this.jobId = eventBody.jobId
    } else {
      // trigger from lambda invocation
      this.jobId = event.jobId
    }

    console.log('+++this.jobId+++', this.jobId)

    // console.log('+++ STOP HERE1')
    // this.currentRunningProcess.exit()
    // console.log('+++ STOP HERE2')
  }

  async stopLambdaTracer() {
    console.log('+++redis stopLambdaTracer+++')

    const memoryAllocationInMB = this.lambdaTraceInfo.lambdaMemoryAllocationInMB
    const processingTime = (moment.utc().valueOf() - this.lambdaTraceInfo.lambdaStartTime) / 1000

    const memoryAndProcessingTimeString = `${memoryAllocationInMB}::${processingTime}`

    await this.tracerStore.rpush(`${CACHE_KEY_PREFIX}${this.jobId}#lambda`, memoryAndProcessingTimeString)
  }
  // **********

  // **********
  // S3
  async getS3ObjectIsCalled() {
    console.log('+++redis getS3ObjectIsCalled+++')
    await this.tracerStore.incr(`${CACHE_KEY_PREFIX}${this.jobId}#s3#getObject`)
  }

  async putS3ObjectIsCalled(params) {
    console.log('+++redis putS3ObjectIsCalled+++')
    const fileContent = params.Body
    const fileSize = _s3FileSizeTracer(fileContent)
    await this.tracerStore.rpush(`${CACHE_KEY_PREFIX}${this.jobId}#s3#putObject`, fileSize)
  }
  // **********

  // **********
  // SQS
  async sendSqsMessageIsCalled(sqsPayload) {
    console.log('+++redis sendSqsMessageIsCalled+++')
    // TODO: for queueType
    const { QueueUrl } = sqsPayload

    const _queueUrlSplitted = QueueUrl.split('/')
    const queueName = _queueUrlSplitted[_queueUrlSplitted.length - 1]

    console.log('+++queueName+++', queueName)

    const sqs64KiloByteChunkAmounts = _sqsPayloadSizeTracer(sqsPayload)
    await this.tracerStore.incrby(`${CACHE_KEY_PREFIX}${this.jobId}#sqs#${queueName}`, sqs64KiloByteChunkAmounts)
    // in case queue names are not known from trace start bc no app is registered
    await this.tracerStore.incrby(`${CACHE_KEY_PREFIX}${this.jobId}#sqs`, sqs64KiloByteChunkAmounts)
  }
  // **********
}
