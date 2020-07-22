import AWS from 'aws-sdk'
import { get } from 'lodash'

import { calculateLambdaProcessingTimes } from '../../utils'

const credentials = new AWS.SharedIniFileCredentials({ profile: process.env.AWS_PROFILE })
AWS.config.credentials = credentials

const serialize = (object) => JSON.stringify(object, null, 2)

// TODO: current price list service api endpoints only for
// us-east-1
// ap-south-1
AWS.config.update({
  region: 'us-east-1',
})

const priceListService = new AWS.Pricing()

const pricePerUnitHelperFunc = (priceObj) => {
  const productOnDemandKey = Object.keys(get(priceObj, 'terms.OnDemand'))[0]
  const productPriceDimensionsKey = Object.keys(get(priceObj, `terms.OnDemand['${productOnDemandKey}'].priceDimensions`))[0]
  const pricePerUnitUSD = get(priceObj, `terms.OnDemand['${productOnDemandKey}'].priceDimensions['${productPriceDimensionsKey}'].pricePerUnit.USD`)

  return pricePerUnitUSD
}

class PriceList {
  constructor() {
    this.priceListService = priceListService
  }

  async describeServices() {
    const param = {
      FormatVersion: 'aws_v1',
    }
    const response = await this.priceListService.describeServices(param).promise()
    return response
  }

  async describeLambdaServices() {
  /*
  { ServiceCode: 'AWSLambda',
    AttributeNames:
    [ 'productFamily',
      'termType',
      'usagetype',
      'locationType',
      'Restriction',
      'servicecode',
      'groupDescription',
      'location',
      'servicename',
      'group' ] }
  */
    const param = {
      FormatVersion: 'aws_v1',
      ServiceCode: 'AWSLambda'
    }
    const response = await this.priceListService.describeServices(param).promise()
    return response
  }

  /**
   * @param {string} region         AWS Region of lambdas
   * @returns {number}              Nano USD per 100ms Lambda execution time
   */
  async getLambdaPricing(region = 'eu-central-1') {
    const FILTERS_MAP = {
      'eu-central-1': {
        location: 'EU (Frankfurt)',
        usagetype: 'EUC1-Lambda-GB-Second',
      }
    }

    const param = {
      ServiceCode: 'AWSLambda',
      Filters: [
        {
          Field: 'servicecode',
          Type: 'TERM_MATCH',
          Value: 'AWSLambda'
        },
        {
          Field: 'location',
          Type: 'TERM_MATCH',
          Value: FILTERS_MAP[region].location
        },
        {
          Field: 'usagetype',
          Type: 'TERM_MATCH',
          Value: FILTERS_MAP[region].usagetype
        },
      ],
      FormatVersion: 'aws_v1',
      MaxResults: 30,
    }

    const lambdaProduct = await this.priceListService.getProducts(param).promise()
    const lambdaPricing = pricePerUnitHelperFunc(
      get(lambdaProduct, 'PriceList[0]')
    )

    // 1 Nano USD = 1e-9 USD
    // Nano USD per 100 ms
    const nanoPrice = Number(`${lambdaPricing}e9`)
    return nanoPrice / 10 // prices are per 100ms periods
  }

  async describeS3Services() {
    /*
      { ServiceCode: 'AmazonS3',
        AttributeNames:
        [ 'fromLocationType',
          'productFamily',
          'volumeType',
          'durability',
          'termType',
          'usagetype',
          'locationType',
          'toLocationType',
          'availability',
          'toLocation',
          'storageClass',
          'feeDescription',
          'servicecode',
          'groupDescription',
          'feeCode',
          'transferType',
          'location',
          'servicename',
          'fromLocation',
          'operation',
          'group' ] }
    */
    const param = {
      FormatVersion: 'aws_v1',
      ServiceCode: 'AmazonS3'
    }
    const response = await this.priceListService.describeServices(param).promise()
    return response
  }

  async getS3Products(region = 'eu-central-1') {
    const LOCATION_MAP = {
      'eu-central-1': 'EU (Frankfurt)'
    }

    const param = {
      ServiceCode: 'AmazonS3',
      Filters: [
        {
          Field: 'servicecode',
          Type: 'TERM_MATCH',
          Value: 'AmazonS3'
        },
        {
          Field: 'location',
          Type: 'TERM_MATCH',
          Value: LOCATION_MAP[region]
        },
      ],
      FormatVersion: 'aws_v1',
      MaxResults: 30,
    }

    const response = await this.priceListService.getProducts(param).promise()
    return response
  }

  async describeSQSServices() {
    /*
      {
      "ServiceCode": "AWSQueueService",
        "AttributeNames": [
          "productFamily",
          "messageDeliveryOrder",
          "termType",
          "usagetype",
          "locationType",
          "Restriction",
          "servicecode",
          "groupDescription",
          "messageDeliveryFrequency",
          "queueType",
          "location",
          "servicename",
          "group"
        ]
      }
    */
    const param = {
      FormatVersion: 'aws_v1',
      ServiceCode: 'AWSQueueService'
    }
    const response = await this.priceListService.describeServices(param).promise()
    return response
  }

  async getSQSPricing(region = 'eu-central-1') {
    const LOCATION_MAP = {
      'eu-central-1': 'EU (Frankfurt)'
    }

    const param = {
      ServiceCode: 'AWSQueueService',
      Filters: [
        {
          Field: 'servicecode',
          Type: 'TERM_MATCH',
          Value: 'AWSQueueService'
        },
        {
          Field: 'location',
          Type: 'TERM_MATCH',
          Value: LOCATION_MAP[region]
        },
      ],
      FormatVersion: 'aws_v1',
      MaxResults: 30,
    }

    const response = await this.priceListService.getProducts(param).promise()

    const fifoQueueProduct = response.PriceList
      .find((product) =>
        get(product, 'product.attributes.messageDeliveryFrequency') === 'Exactly Once'
        && get(product, 'product.attributes.messageDeliveryOrder') === 'Guaranteed')

    const standardQueueProduct = response.PriceList
      .find((product) =>
        get(product, 'product.attributes.messageDeliveryFrequency') === 'At Least Once'
        && get(product, 'product.attributes.messageDeliveryOrder') === 'Not Guaranteed')

    const sqsPricing = {
      fifo: pricePerUnitHelperFunc(fifoQueueProduct),
      standard: pricePerUnitHelperFunc(standardQueueProduct),
    }

    return sqsPricing
  }

  async calculateLambdaPrice(fullTrace, region = 'eu-central-1') {
    const lambdaProcessingTimes = calculateLambdaProcessingTimes(fullTrace)

    // TODO: enhance function with lambda memory usage of each function
    const lambdaPricingPer100Ms = await this.getLambdaPricing(region)
    const lambdaPrices = lambdaProcessingTimes.map((lambdaProcTime) => {
      const roundedLambdaProcTime = Math.ceil(lambdaProcTime * 10)

      return roundedLambdaProcTime * lambdaPricingPer100Ms // Nano USD
    })

    const lambdaTotalPrice = lambdaPrices.reduce((acc, val) => (acc + val), 0)
    console.log('++++calculateLambdaPrice', lambdaPrices, lambdaTotalPrice)
    return lambdaTotalPrice
  }

  async calculateSqsPrice(sqsRequestsMapPerQueue, region = 'eu-central-1') {
    // Pricing per 1 million Requests after Free tier(Monthly)
    // Standard Queue     $0.40   ($0.0000004 per request)
    // FIFO Queue         $0.50   ($0.0000005 per request)

    // FIFO Requests
    // API actions for sending, receiving, deleting, and changing visibility of messages
    // from FIFO queues are charged at FIFO rates.  All other API requests are charged at standard rates.

    // Size of Payloads
    // Each 64 KB chunk of a payload is billed as 1 request
    // (for example, an API action with a 256 KB payload is billed as 4 requests).

    // TODO: enhance funtion with queue type through queueUrl: for now all queues are standard type
    const { fifo, standard } = await this.getSQSPricing(region)
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
    console.log('+++sqsPrice', {
      messageAmountsPerType, sqsStandardPrice, sqsFIFOPrice, sqsTotalPrice,
    })
    return sqsTotalPrice
  }
}

export default PriceList
