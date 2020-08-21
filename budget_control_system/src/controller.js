import HttpStatus from 'http-status-codes'
import { set } from 'lodash'
import uuid from 'node-uuid'

import DynamoDB from './service/trace-store/dynamo'

const appRegisterStore = new DynamoDB('app-register-store')

const registerApp = async (req, res) => {
  console.log('+++data', req.body)

  const cloudFormationTemplate = JSON.parse(req.body)
  const resourceNames = Object.keys(cloudFormationTemplate.Resources)

  const sqsResourceNames = resourceNames.filter(
    (rName) => cloudFormationTemplate.Resources[rName].Type === 'AWS::SQS::Queue'
  )

  const cloudFormationData = sqsResourceNames.reduce((acc, sqsRN) => {
    const sqsResource = cloudFormationTemplate.Resources[sqsRN]
    const queueType = sqsResource.Properties.FifoQueue ? 'fifo' : 'standard'

    set(acc, `sqs.${sqsRN}.queueType`, queueType)

    return acc
  }, {
    sqs: {},
  })

  console.log('+++cloudFormationData', cloudFormationData)

  const appId = `app-${uuid.v4()}`
  const storeItem = {
    appId,
    ...cloudFormationData,
  }
  const createdItem = await appRegisterStore.put(storeItem)
  console.log('+++createdItem', createdItem)

  res.status(HttpStatus.CREATED).json(storeItem)
}

export default {
  registerApp,
}
