const moment = require('moment')
const Redis = require('ioredis')

module.exports = class AWSTracer {
  constructor(envVariables) {
    const {
      REDIS_HOST,
      REDIS_PORT,
      REDIS_PASSWORD,
      REDIS_CONNECTION,
    } = envVariables

    this.tracerStore = REDIS_CONNECTION
      ? new Redis(REDIS_CONNECTION)
      : new Redis({
        port: REDIS_PORT, // Redis port
        host: REDIS_HOST, // Redis host
        family: 4, // 4 (IPv4) or 6 (IPv6)
        password: REDIS_PASSWORD,
        db: 0,
      })

    this.lambdaStartTime = moment.utc().valueOf()
  }

  startLambdaTracer(event, context) {
    this.lambdaStartTime = moment.utc().valueOf()

    console.log('+++redis lambdaStartTime', this.lambdaStartTime)

    const eventBody = JSON.parse(event.body)
    const { jobId } = eventBody

    const traceInfo = {
      lambdaMemoryAllocationInMB: context.memoryLimitInMB,
      jobId,
    }

    return traceInfo
  }

  async stopLambdaTracer(traceInfo) {
    const {
      lambdaMemoryAllocationInMB,
      jobId,
    } = traceInfo
    await this.tracerStore.get('hello')
    await this.tracerStore.set(jobId, traceInfo)
    await this.tracerStore.set(`${jobId}-lambdaMemoryAllocationInMB`, lambdaMemoryAllocationInMB)
  }
}
