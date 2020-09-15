import Redis from 'ioredis'
import { get, set } from 'lodash'

// Key format: tracer_{jobId}#{serviceType}#{serviceMethod}
const REDIS_CACHE_KEY_PREFIX = 'tracer_'
export default class RedisTracer {
  constructor(redisConfig) {
    const {
      REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_CONNECTION,
    } = redisConfig
    this.redisTracerCache = REDIS_CONNECTION
      ? new Redis(REDIS_CONNECTION)
      : new Redis({
        port: REDIS_PORT,
        host: REDIS_HOST,
        family: 4,
        password: REDIS_PASSWORD,
        db: 0,
      })
  }

  async getLambdaTraceAndCalculatePrice(jobId) {
    const tracedLambdaCacheKey = `${REDIS_CACHE_KEY_PREFIX}${jobId}#lambda`
    const tracedLambdaCacheEntry = (
      await this.redisTracerCache.lrange(tracedLambdaCacheKey, 0, -1) || []
    )

    const tracedLambdaSegments = tracedLambdaCacheEntry.map((delimitedString) => {
      const [memoryAllocationInMB, processingTimeString] = delimitedString.split('::')
      return {
        memoryAllocationInMB: Number(memoryAllocationInMB),
        processingTime: Number(processingTimeString),
      }
    })

    return tracedLambdaSegments
  }

  async getSqsTraceAndCalculatePrice(jobId, queueMap) {
    const availableQueues = Object.keys(queueMap)

    if (availableQueues.length > 0) {
      const { standardQueueChunks, fifoQueueChunks } = await availableQueues
        .reduce(async (prevPromise, queueName) => {
          const acc = await prevPromise
          const queueType = get(queueMap, `${queueName}.queueType`, 'standard')

          if (queueType === 'fifo') {
            // get amount of sqs msg chunks from redis cache
            // NOTE: FiFo queues must have fifo suffix in queueName
            const tracedSqsChunks = Number(await this.redisTracerCache.get(`${REDIS_CACHE_KEY_PREFIX}${jobId}#sqs#${queueName}.fifo`)) || 0

            set(acc, 'fifoQueueChunks', acc.fifoQueueChunks + tracedSqsChunks)
          } else {
            // get amount of sqs msg chunks from redis cache
            const tracedSqsChunks = Number(await this.redisTracerCache.get(`${REDIS_CACHE_KEY_PREFIX}${jobId}#sqs#${queueName}`)) || 0
            set(acc, 'standardQueueChunks', acc.standardQueueChunks + tracedSqsChunks)
          }

          return acc
        }, {
          standardQueueChunks: 0,
          fifoQueueChunks: 0,
        })

      return {
        standard: standardQueueChunks,
        fifo: fifoQueueChunks,
      }
    }

    const tracedSqsChunks = Number(await this.redisTracerCache.get(`${REDIS_CACHE_KEY_PREFIX}${jobId}#sqs`)) || 0

    return {
      standard: tracedSqsChunks,
    }
  }

  async getS3TraceAndCalculatePrice(jobId) {
    // returns amount of method calls
    const tracedS3GetObjectCallsCacheKey = `${REDIS_CACHE_KEY_PREFIX}${jobId}#s3#getObject`
    const tracedS3GetObjectCalls = Number(
      await this.redisTracerCache.get(tracedS3GetObjectCallsCacheKey)
    ) || 0

    // returns array of file sizes
    const tracedS3PutObjectCallsCacheKey = `${REDIS_CACHE_KEY_PREFIX}${jobId}#s3#putObject`
    const tracedS3PutObjectCalls = await this.redisTracerCache
      .lrange(tracedS3PutObjectCallsCacheKey, 0, -1) || []
    const tracedS3PutObjectFileSizeArray = tracedS3PutObjectCalls.map((str) => Number(str))

    console.log('+++getS3TraceAndCalculatePrice', {
      tracedS3GetObjectCalls,
      tracedS3PutObjectFileSizeArray,
    })

    return {
      fileSizesInKB: tracedS3PutObjectFileSizeArray,
      s3RequestsMap: {
        GetObject: tracedS3GetObjectCalls,
        PutObject: tracedS3PutObjectFileSizeArray.length,
      }
    }
  }
}
