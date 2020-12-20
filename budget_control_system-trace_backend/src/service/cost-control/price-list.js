import AWS from 'aws-sdk'
import { get } from 'lodash'

const credentials = new AWS.SharedIniFileCredentials({ profile: process.env.AWS_PROFILE })
AWS.config.credentials = credentials

// Price list service api endpoints only available for us-east-1 and ap-south-1
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

const multiplePricesPerUnitHelperFunc = (priceObj) => {
  const productOnDemandKey = Object.keys(get(priceObj, 'terms.OnDemand'))[0]
  const productPriceDimensionsKeys = Object.keys(get(priceObj, `terms.OnDemand['${productOnDemandKey}'].priceDimensions`))

  const pricesObjectsInUSD = productPriceDimensionsKeys.reduce((acc, priceDimensionKey) => {
    const priceDimensionProduct = get(priceObj, `terms.OnDemand['${productOnDemandKey}'].priceDimensions['${priceDimensionKey}']`)
    acc.push({
      ...priceDimensionProduct,
      pricePerUnitUSD: get(priceDimensionProduct, 'pricePerUnit.USD'),
    })

    return acc
  }, [])

  return pricesObjectsInUSD
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

  async getS3Pricing(tierType, region = 'eu-central-1') {
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
      MaxResults: 100,
    }

    const response = await this.priceListService.getProducts(param).promise()

    // 1. Storage
    const storageProducts = response.PriceList
      .find((product) => get(product, 'product.attributes.usagetype') === 'EUC1-TimedStorage-ByteHrs')

    const storagePrices = multiplePricesPerUnitHelperFunc(storageProducts)

    // 2. Request and Data Retrievals
    // PUT/COPY/POST or LIST requests
    const putCopyPostListRequestProduct = response.PriceList
      .find((product) => get(product, 'product.attributes.usagetype') === 'EUC1-Requests-Tier1')

    const putCopyPostListRequests = pricePerUnitHelperFunc(putCopyPostListRequestProduct)

    // GET, SELECT, and all other requests
    const getSelectOthersRequestsProcuct = response.PriceList
      .find((product) => get(product, 'product.attributes.usagetype') === 'EUC1-Requests-Tier2')

    const getSelectOthersRequests = pricePerUnitHelperFunc(getSelectOthersRequestsProcuct)

    const requestAndDataRetrievalsPrices = {
      PutObject: putCopyPostListRequests,
      CopyObject: putCopyPostListRequests,
      PostObject: putCopyPostListRequests,
      ListObjects: putCopyPostListRequests,
      GetObject: getSelectOthersRequests,
      SelectObject: getSelectOthersRequests,
      Others: getSelectOthersRequests,
    }

    // 3. Data transfer
    // Note: Transfers between S3 buckets or from Amazon S3 to
    // any service(s) within the same AWS Region are free.
    // Source: https://aws.amazon.com/s3/pricing/?nc1=h_ls (accessed: 2020/07/31)
    const dataTransferPrices = 0

    // 4. Management and Replication
    // Note: By default all the management and replication features are disabled
    const managementAndReplicationPrices = 0

    return {
      storagePrices,
      requestAndDataRetrievalsPrices,
      dataTransferPrices,
      managementAndReplicationPrices,
    }
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
}

export default PriceList
