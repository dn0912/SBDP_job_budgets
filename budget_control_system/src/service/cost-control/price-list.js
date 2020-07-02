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

  /* { ServiceCode: 'AWSLambda',
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
  async describeLambdaServices() {
    const param = {
      FormatVersion: 'aws_v1',
      ServiceCode: 'AWSLambda'
    }
    const response = await this.priceListService.describeServices(param).promise()
    return response
  }

  // TODO:
  // example code from https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Pricing.html#getProducts-property is not working
  async getProducts(region = 'eu-central-1') {
    // const param = {
    // Filters: [{
    //   Field: 'serviceCode',
    //   Type: 'TERM_MATCH',
    //   Value: 'AmazonDynamoDB'
    // }],
    // }

    // const param = {
    //   ServiceCode: 'AmazonEC2',
    //   Filters: [
    //     {
    //       Field: 'ServiceCode',
    //       Type: 'TERM_MATCH',
    //       Value: 'AmazonEC2'
    //     },
    //   ],
    //   FormatVersion: 'aws_v1',
    //   MaxResults: 1
    // }
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
}

export default PriceList
