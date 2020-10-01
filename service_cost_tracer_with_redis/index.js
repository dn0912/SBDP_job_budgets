const Redis = require('ioredis')

const BudgetError = require('./budget-error')

// Key format: tracer_{jobId}#{serviceType}#{serviceMethod}
const CACHE_KEY_PREFIX = 'tracer_'

const createFlagPoleCacheKey = (jobId) => `flag_${jobId}`

const _s3FileSizeTracer = (fileContent) => {
  const contentByteSize = Buffer.byteLength(JSON.stringify(fileContent), 'utf8')
  const s3ContentKiloByteSize = contentByteSize / 1024

  console.log('+++s3ContentKiloByteSize+++', s3ContentKiloByteSize)

  return s3ContentKiloByteSize
}

const _getSqsQueueNameFromPayload = (sqsPayload) => {
  const { QueueUrl } = sqsPayload
  const _queueUrlSplitted = QueueUrl.split('/')
  const queueName = _queueUrlSplitted[_queueUrlSplitted.length - 1]
  return queueName
}

const _sqsPayloadSizeTracer = (sqsPayload) => {
  const payloadByteSize = Buffer.byteLength(JSON.stringify(sqsPayload), 'utf8')
  const sqs64KiloByteChunkAmounts = Math.ceil(payloadByteSize / 1024 / 64)

  console.log('+++sqs64KiloByteChunkAmounts+++', sqs64KiloByteChunkAmounts)

  return sqs64KiloByteChunkAmounts
}

module.exports = class AWSTracer {
  constructor() {
    const {
      REDIS_HOST,
      REDIS_PORT,
      REDIS_PASSWORD,
      REDIS_CONNECTION,
    } = process.env

    console.log('+++process.env+++', process.env)

    this.tracerStoreClient = REDIS_CONNECTION
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
      lambdaFunctionName: null,
      lambdaInvokedFunctionArn: null,
    }

    // TODO: only for evaluation purpose
    this.awsRequestId = null

    // TODO: *** Redis Keyspace notification
    this.redisKeyspaceNotificationSubscriberClient = REDIS_CONNECTION
      ? new Redis(REDIS_CONNECTION)
      : new Redis({
        port: REDIS_PORT, // Redis port
        host: REDIS_HOST, // Redis host
        family: 4, // 4 (IPv4) or 6 (IPv6)
        password: REDIS_PASSWORD,
        db: 0,
      })

    this.redisKeyspaceNotificationSubscriberClient.config('set', 'notify-keyspace-events', 'KEA')

    this.redisKeyspaceNotificationSubscriberClient.psubscribe('__keyevent@0__:set')

    this.redisKeyspaceNotificationSubscriberClient.on('pmessage', async (pattern, channel, message) => {
      console.log('+++channel, message', { pattern, channel, message })
      this.checkFlagPerSubscription({ pattern, channel, message })
    })
  }

  async checkFlagPerSubscription({ pattern, channel, message }) {
    console.log('+++inside checkFlagPerSubscription', { pattern, channel, message })

    // Flag format: flag_jobId

    if (message === createFlagPoleCacheKey(this.jobId)) {
      await this.checkFlag()
    }
  }

  traceS3GetObject(fn) {
    return async (...args) => {
      const result = await fn(...args)
      await this.getS3ObjectIsCalled(...args)
      return result
    }
  }

  traceS3PutObject(fn) {
    return async (...args) => {
      const result = await fn(...args)
      await this.putS3ObjectIsCalled(...args)
      return result
    }
  }

  traceSQSSendMessage(fn) {
    return async (...args) => {
      const result = await fn(...args)
      await this.sendSqsMessageIsCalled(...args)
      return result
    }
  }

  traceSQSDeleteMessage(fn) {
    return async (...args) => {
      const result = await fn(...args)
      await this.deleteSqsMessageIsCalled(...args)
      return result
    }
  }

  async checkFlag() {
    const flagStatus = await this.tracerStoreClient.get(createFlagPoleCacheKey(this.jobId))
    if (flagStatus) {
      // process.exit(0)
      throw new BudgetError(`Job budget of ${flagStatus}$ exceeded`)
    }

    // TODO: for testing purpose only
    await this.tracerStoreClient.incr(`TEST_FLAG#####${this.jobId}`)
  }

  // **********
  // LAMBDA

  // use in Lambda as early as possible
  async startLambdaTracer(event, context) {
    this.lambdaTraceInfo.lambdaStartTime = Date.now()
    this.lambdaTraceInfo.lambdaMemoryAllocationInMB = context.memoryLimitInMB
    this.lambdaTraceInfo.lambdaFunctionName = context.functionName
    this.lambdaTraceInfo.lambdaInvokedFunctionArn = context.invokedFunctionArn
    this.awsRequestId = context.awsRequestId

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

    await this.checkFlag()
  }

  async stopLambdaTracer() {
    console.log('+++redis stopLambdaTracer+++')

    const memoryAllocationInMB = this.lambdaTraceInfo.lambdaMemoryAllocationInMB
    const stopLambdaTs = Date.now()
    const processingTime = (stopLambdaTs - this.lambdaTraceInfo.lambdaStartTime) / 1000

    const memoryAndProcessingTimeString = `${memoryAllocationInMB}::${processingTime}::${this.awsRequestId}`

    await this.tracerStoreClient.rpush(`${CACHE_KEY_PREFIX}${this.jobId}#lambda`, memoryAndProcessingTimeString)

    // TODO: for evaluation of redis speed
    await this.tracerStoreClient.set(`evaluation_${this.lambdaTraceInfo.lambdaInvokedFunctionArn}#${this.jobId}`, stopLambdaTs)
    await this.checkFlag()
  }

  /**
   * For intermediate budget checking in lambda code.
   */
  async checkForBudget() {
    console.log('+++redis checkForBudget+++')

    const memoryAllocationInMB = this.lambdaTraceInfo.lambdaMemoryAllocationInMB
    const processingTime = (Date.now() - this.lambdaTraceInfo.lambdaStartTime) / 1000

    this.lambdaTraceInfo.lambdaStartTime = Date.now()

    const memoryAndProcessingTimeString = `${memoryAllocationInMB}::${processingTime}`
    await this.tracerStoreClient.rpush(`${CACHE_KEY_PREFIX}${this.jobId}#lambda`, memoryAndProcessingTimeString)

    await this.checkFlag()
  }
  // **********

  // **********
  // S3
  async getS3ObjectIsCalled() {
    console.log('+++redis getS3ObjectIsCalled+++')
    await this.tracerStoreClient.incr(`${CACHE_KEY_PREFIX}${this.jobId}#s3#getObject`)

    await this.checkFlag()
  }

  async putS3ObjectIsCalled(params) {
    console.log('+++redis putS3ObjectIsCalled+++')
    const fileContent = params.Body
    const fileSize = _s3FileSizeTracer(fileContent)
    await this.tracerStoreClient.rpush(`${CACHE_KEY_PREFIX}${this.jobId}#s3#putObject`, fileSize)

    await this.checkFlag()
  }
  // **********

  // **********
  // SQS
  async sendSqsMessageIsCalled(sqsPayload) {
    console.log('+++redis sendSqsMessageIsCalled+++')
    // TODO: for queueType
    const queueName = _getSqsQueueNameFromPayload(sqsPayload)

    console.log('+++queueName+++', queueName)

    const sqs64KiloByteChunkAmounts = _sqsPayloadSizeTracer(sqsPayload)
    await this.tracerStoreClient.incrby(`${CACHE_KEY_PREFIX}${this.jobId}#sqs#${queueName}`, sqs64KiloByteChunkAmounts)
    // in case queue names are not known from trace start bc no app is registered
    await this.tracerStoreClient.incrby(`${CACHE_KEY_PREFIX}${this.jobId}#sqs`, sqs64KiloByteChunkAmounts)

    await this.checkFlag()
  }

  async deleteSqsMessageIsCalled(sqsPayload) {
    console.log('+++redis deleteSqsMessageIsCalled+++')
    const queueName = _getSqsQueueNameFromPayload(sqsPayload)
    console.log('+++queueName+++', queueName)
    await this.tracerStoreClient.incr(`${CACHE_KEY_PREFIX}${this.jobId}#sqs#${queueName}`)
    await this.tracerStoreClient.incr(`${CACHE_KEY_PREFIX}${this.jobId}#sqs`)

    await this.checkFlag()
  }
  // **********
}
