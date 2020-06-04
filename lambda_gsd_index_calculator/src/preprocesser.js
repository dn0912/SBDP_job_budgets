const { BUCKET, FILE, RESULT_FOLDER } = process.env

const AWS = require('aws-sdk')
const moment = require('moment')
const s3 = new AWS.S3()

const { promisify } = require('util')

const getS3Object = promisify(s3.getObject).bind(s3)
const putS3Object = promisify(s3.putObject).bind(s3)

const readFile = async (bucketName, fileName) => {
  const params = {
    Bucket: bucketName,
    Key: fileName,
  }

  const data = await getS3Object(params)
  return data.Body.toString('utf-8')
}

const putFile = async (fileContent) => {
  const currentmTimeStamp = moment().valueOf()
  const fileName = `${currentmTimeStamp}_processedUpdates.json`
  await putS3Object({
    Bucket: BUCKET,
    Key: `${RESULT_FOLDER}/${fileName}`,
    Body: JSON.stringify(fileContent),
  })

  return fileName
}

// TODO:
const filterUnnecessaryUpdates = (tasksUpdateArray) => {
  const filteredTaskUpdateArray = tasksUpdateArray.filter(updateEntry =>
    updateEntry['OldImage']['statusId'] !== updateEntry['NewImage']['statusId'])
  
  return filteredTaskUpdateArray
}

module.exports.readandFilterFile = async (event, context) => {
  console.log('+++event', event)
  console.log('+++context', context)
  try {
    const s3FileContentAsString = await readFile(BUCKET, FILE)
    console.log('+++readsuccess')

    const s3FileContent = JSON.parse(s3FileContentAsString)
    const cleanTaskUpdates = filterUnnecessaryUpdates(s3FileContent)
    console.log('+++filtersuccess')
    const fileName = await putFile(cleanTaskUpdates)

    console.log('+++fileName', fileName)

    const responseBody = {
      fileName,
      info: event.body,
    }
    const response = {
      statusCode: 200,
      body: JSON.stringify(responseBody),
    }
    console.log('+++response', response)
    return response
  } catch (err) {
    return {
      statusCode: err.statusCode || 400,
      body: err.message || JSON.stringify(err.message)
    }
  }
}
