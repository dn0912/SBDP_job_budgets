import { get } from 'lodash'

import {
  calculateLambdaProcessingTimes,
  createServiceTracingMap,
  calculateS3ContentSizeInGB,
  calculateSqsRequestAmountsPerQueue,
  calculateS3ContentSizeInGBFromRedis,
} from './utils'

class PriceCalculator {
  constructor(lambdaPricing, sqsPricing, s3Pricing) {
    this.lambdaPricing = lambdaPricing
    this.sqsPricing = sqsPricing
    this.s3Pricing = s3Pricing
  }

  calculateLambdaPrice(fullTrace, isTraceFromCache = false) {
    let lambdaProcessingTimes
    if (isTraceFromCache) {
      lambdaProcessingTimes = fullTrace
    } else {
      lambdaProcessingTimes = calculateLambdaProcessingTimes(fullTrace)
    }

    // enhance function with lambda memory usage of each function
    const lambdaPricingPer100MsWith1GBMemory = this.lambdaPricing
    const lambdaPrices = lambdaProcessingTimes.map((tracedLambdaVal) => {
      const roundedLambdaProcTime = Math.ceil(tracedLambdaVal.processingTime * 10)
      const memoryAllocation = tracedLambdaVal.memoryAllocationInMB

      const lambdaPricePer100MS = (1024 / memoryAllocation) * lambdaPricingPer100MsWith1GBMemory

      return lambdaPricePer100MS * roundedLambdaProcTime // Nano USD
    })

    const lambdaTotalPrice = lambdaPrices.reduce((acc, val) => (acc + val), 0)
    return lambdaTotalPrice
  }

  // NOTE: implemented SQS pricing difference by queuetype only for Redis version
  calculateSqsPrice(fullTrace, fifoQueueChunkAmount = 0, isTraceFromCache = false) {
    // Pricing per 1 million Requests after Free tier(Monthly)
    // Standard Queue     $0.40   ($0.0000004 per request)
    // FIFO Queue         $0.50   ($0.0000005 per request)

    // FIFO Requests
    // API actions for sending, receiving, deleting, and changing visibility of messages from FIFO
    // queues are charged at FIFO rates.  All other API requests are charged at standard rates.

    // Size of Payloads
    // Each 64 KB chunk of a payload is billed as 1 request
    // (for example, an API action with a 256 KB payload is billed as 4 requests).

    let messageAmountsPerType
    if (isTraceFromCache) {
      messageAmountsPerType = {
        standard: Number(fullTrace),
        fifo: Number(fifoQueueChunkAmount),
      }
    } else {
      const sqsRequestsMapPerQueue = calculateSqsRequestAmountsPerQueue(fullTrace)
      const queueUrls = Object.keys(sqsRequestsMapPerQueue)
      messageAmountsPerType = queueUrls.reduce((acc, url) => {
        const queueType = sqsRequestsMapPerQueue[url].QueueType
        const SendMessageRequestAmount = sqsRequestsMapPerQueue[url].SendMessage

        return {
          ...acc,
          [queueType]: acc[queueType] + SendMessageRequestAmount,
        }
      }, {
        standard: 0,
        fifo: 0,
      })
    }

    const { fifo, standard } = this.sqsPricing
    // in Nano USD
    const sqsStandardPrice = Number(`${standard}e9`) * messageAmountsPerType.standard
    const sqsFIFOPrice = Number(`${fifo}e9`) * messageAmountsPerType.fifo

    const sqsTotalPrice = sqsStandardPrice + sqsFIFOPrice
    return sqsTotalPrice
  }

  // TODO: currently only S3 Standard
  calculateS3Price(fullTrace, isTraceFromCache = false) {
    const s3Pricings = this.s3Pricing

    const _calculateStorageFactor = (completeTrace) => {
      // UserInput of how much data (in GB) is already stored in S3 for pricing calculation
      const s3CurrentUsageInGB = 0
      const pricePerGBFactor = s3Pricings.storagePrices.find((priceObj) => {
        const beginRange = Number(priceObj.beginRange)
        const endRange = Number(priceObj.endRange) || -1 // -1 in case 'Inf'

        if (endRange !== -1) {
          return (beginRange <= s3CurrentUsageInGB && s3CurrentUsageInGB <= endRange)
        }
        return s3CurrentUsageInGB >= beginRange
      })

      let s3ContentSizeInGB
      if (isTraceFromCache) {
        s3ContentSizeInGB = calculateS3ContentSizeInGBFromRedis(completeTrace.fileSizesInKB)
      } else {
        s3ContentSizeInGB = calculateS3ContentSizeInGB(completeTrace)
      }

      return Math.ceil(s3ContentSizeInGB) * pricePerGBFactor.pricePerUnitUSD
    }

    const _calculateRequestAndRetrievalsFactor = (completeTrace) => {
      let s3RequestsMap
      if (isTraceFromCache) {
        s3RequestsMap = completeTrace.s3RequestsMap
      } else {
        const fullRequestTracingMap = createServiceTracingMap(completeTrace)
        s3RequestsMap = get(fullRequestTracingMap, 'S3', {})
      }

      const price = Object.keys(s3RequestsMap)
        .reduce((acc, requestType) => {
          const requestAmount = s3RequestsMap[requestType] || 0

          const priceForRequest = s3Pricings.requestAndDataRetrievalsPrices[requestType]
            || s3Pricings.requestAndDataRetrievalsPrices.Others

          // every 1000 request
          // return acc + priceForRequest * Math.ceil(requestAmount / 1000) * 1000
          // every request
          return acc + priceForRequest * requestAmount
        }, 0)

      return price
    }

    const storagePrice = _calculateStorageFactor(fullTrace)

    // Request and Data Retrieval price
    // e.g. { SQS: { SendMessage: 2 }, S3: { GetObject: 4, PutObject: 4 } }
    const requestAndDataRetrievalsPrice = _calculateRequestAndRetrievalsFactor(fullTrace)

    const s3Totalprice = storagePrice + requestAndDataRetrievalsPrice

    // nano USD
    return s3Totalprice * 10 ** 9
  }
}

export default PriceCalculator
