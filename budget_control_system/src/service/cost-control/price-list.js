import AWS from 'aws-sdk'
import { get } from 'lodash'

const credentials = new AWS.SharedIniFileCredentials({ profile: process.env.AWS_PROFILE })
AWS.config.credentials = credentials

// TODO: current price list service api endpoints only for
// us-east-1
// ap-south-1
AWS.config.update({
  region: 'us-east-1',
})

const priceListService = new AWS.Pricing()

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
    const lambdaOnDemandKey = Object.keys(get(lambdaProduct, 'PriceList[0].terms.OnDemand'))[0]
    const lambdaPriceDimensionsKey = Object.keys(get(lambdaProduct, `PriceList[0].terms.OnDemand['${lambdaOnDemandKey}'].priceDimensions`))[0]
    const lambdaPricing = get(lambdaProduct, `PriceList[0].terms.OnDemand['${lambdaOnDemandKey}'].priceDimensions['${lambdaPriceDimensionsKey}'].pricePerUnit.USD`)

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

  async getSQSProducts(region = 'eu-central-1') {
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
    return response
  }
}

export default PriceList
