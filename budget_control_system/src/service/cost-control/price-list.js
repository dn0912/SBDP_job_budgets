import AWS from 'aws-sdk'

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

  // TODO:
  // example code from https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Pricing.html#getProducts-property is not working
  async getLambdaProducts(region = 'eu-central-1') {
    const LOCATION_MAP = {
      'eu-central-1': 'EU (Frankfurt)'
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
          Value: LOCATION_MAP[region]
        },
      ],
      FormatVersion: 'aws_v1',
      MaxResults: 30,
    }

    const response = await this.priceListService.getProducts(param).promise()
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
}

export default PriceList
