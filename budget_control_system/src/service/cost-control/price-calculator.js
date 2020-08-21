import { get } from 'lodash'

import {
  calculateLambdaProcessingTimes,
  createServiceTracingMap,
  calculateS3ContentSizeInGB,
  calculateSqsRequestAmountsPerQueue,
} from './utils'

class PriceCalculator {
  constructor(lambdaPricing, sqsPricing, s3Pricing) {
    this.lambdaPricing = lambdaPricing
    this.sqsPricing = sqsPricing
    this.s3Pricing = s3Pricing
  }

  calculateLambdaPrice(fullTrace) {
    const lambdaProcessingTimes = calculateLambdaProcessingTimes(fullTrace)

    // TODO: enhance function with lambda memory usage of each function
    const lambdaPricingPer100MsWith1GBMemory = this.lambdaPricing
    // console.log('+++lambdaPricingPer100Ms', lambdaPricingPer100MsWith1GBMemory)
    const lambdaPrices = lambdaProcessingTimes.map((tracedLambdaVal) => {
      const roundedLambdaProcTime = Math.ceil(tracedLambdaVal.processingTime * 10)
      const memoryAllocation = tracedLambdaVal.memoryAllocationInMB

      const lambdaPricePer100MS = (1024 / memoryAllocation) * lambdaPricingPer100MsWith1GBMemory

      return lambdaPricePer100MS * roundedLambdaProcTime // Nano USD
    })

    const lambdaTotalPrice = lambdaPrices.reduce((acc, val) => (acc + val), 0)
    // console.log('++++calculateLambdaPrice', lambdaPrices, lambdaTotalPrice)
    return lambdaTotalPrice
  }

  calculateSqsPrice(fullTrace) {
    // Pricing per 1 million Requests after Free tier(Monthly)
    // Standard Queue     $0.40   ($0.0000004 per request)
    // FIFO Queue         $0.50   ($0.0000005 per request)

    // FIFO Requests
    // API actions for sending, receiving, deleting, and changing visibility of messages from FIFO
    // queues are charged at FIFO rates.  All other API requests are charged at standard rates.

    // Size of Payloads
    // Each 64 KB chunk of a payload is billed as 1 request
    // (for example, an API action with a 256 KB payload is billed as 4 requests).

    // TODO: enhance funtion with queue type through queueUrl: for now all queues are standard type

    const sqsRequestsMapPerQueue = calculateSqsRequestAmountsPerQueue(fullTrace)
    const { fifo, standard } = this.sqsPricing
    const queueUrls = Object.keys(sqsRequestsMapPerQueue)
    const messageAmountsPerType = queueUrls.reduce((acc, url) => {
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

    // in Nano USD
    const sqsStandardPrice = Number(`${standard}e9`) * messageAmountsPerType.standard
    const sqsFIFOPrice = Number(`${fifo}e9`) * messageAmountsPerType.fifo

    const sqsTotalPrice = sqsStandardPrice + sqsFIFOPrice
    // console.log('+++sqsPrice', {
    //   messageAmountsPerType, sqsStandardPrice, sqsFIFOPrice, sqsTotalPrice,
    // })
    return sqsTotalPrice
  }

  // TODO: currently only S3 Standard
  calculateS3Price(fullTrace) {
    const s3Pricings = this.s3Pricing
    // console.log('+++s3Pricings', s3Pricings)

    const _calculateStorageFactor = (completeTrace) => {
      // TODO: UserInput of how much data (in GB) is already stored in S3 for pricing calculation
      const s3CurrentUsageInGB = 0
      const pricePerGBFactor = s3Pricings.storagePrices.find((priceObj) => {
        const beginRange = Number(priceObj.beginRange)
        const endRange = Number(priceObj.endRange) || -1 // -1 in case 'Inf'

        if (endRange !== -1) {
          return (beginRange <= s3CurrentUsageInGB && s3CurrentUsageInGB <= endRange)
        }
        return s3CurrentUsageInGB >= beginRange
      })

      const s3ContentSizeInGB = calculateS3ContentSizeInGB(completeTrace)
      // console.log('+++s3ContentSizeInGB', s3ContentSizeInGB)

      return Math.ceil(s3ContentSizeInGB) * pricePerGBFactor.pricePerUnitUSD
    }

    const _calculateRequestAndRetrievalsFactor = (completeTrace) => {
      const fullRequestTracingMap = createServiceTracingMap(completeTrace)
      const s3RequestsMap = get(fullRequestTracingMap, 'S3', {})
      // TODO: add PUT, COPY, POST, LIST request as one type together
      const price = Object.keys(s3RequestsMap)
        .reduce((acc, requestType) => {
          const requestAmount = s3RequestsMap[requestType] || 0

          const priceForRequest = s3Pricings.requestAndDataRetrievalsPrices[requestType]
            || s3Pricings.requestAndDataRetrievalsPrices.Others

          // every 1000 request
          return acc + priceForRequest * Math.ceil(requestAmount / 1000)
        }, 0)

      return price
    }

    const _calculateDataTransferFactor = () => { }
    const _calculateManagementAndReplicationFactor = () => { }

    // TODO: get userinput of how much data he already used on S3 for pricing factor
    const storagePrice = _calculateStorageFactor(fullTrace)

    // 2. Request and Data Retrieval price
    // e.g. { SQS: { SendMessage: 2 }, S3: { GetObject: 4, PutObject: 4 } }
    const requestAndDataRetrievalsPrice = _calculateRequestAndRetrievalsFactor(fullTrace)

    const s3Totalprice = storagePrice + requestAndDataRetrievalsPrice

    // console.log('+++s3Totalprice', {
    //   storagePrice,
    //   requestAndDataRetrievalsPrice,
    // })

    // nano USD
    return Number(`${s3Totalprice}e9`)
  }
}

export default PriceCalculator
