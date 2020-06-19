const AWS = require('aws-sdk')
const { BUCKET } = process.env

const { promisify } = require('util')

const s3 = new AWS.S3()

const listS3ObjectsV2 = promisify(s3.listObjectsV2).bind(s3)
const deleteS3Objects = promisify(s3.deleteObjects).bind(s3)

const getFileKeySFromTempFolders = async () => {
  const response = await listS3ObjectsV2({
    Bucket: BUCKET,
  })
  return response.Contents
    .filter(obj =>
      (obj.Key.startsWith('gsd/') && obj.Key.endsWith('.json'))
      || (obj.Key.startsWith('test_results/') && obj.Key.endsWith('.json')))
    .map(obj => obj.Key)
}

const deleteFiles = async (keysArray) => {
  const params = {
    Bucket: BUCKET,
    Delete: {
      Objects: keysArray.map(key => ({ Key: key })),
      Quiet: false,
    },
  }
  return await deleteS3Objects(params)
}

module.exports.cleanup = async (event, context) => {
  try {
    const keysArray = await getFileKeySFromTempFolders()
    const response = await deleteFiles(keysArray)
    console.log('+++response', response)
  } catch(err) {
    return {
      statusCode: err.statusCode || 400,
      body: err.message || JSON.stringify(err.message)
    }
  }
}