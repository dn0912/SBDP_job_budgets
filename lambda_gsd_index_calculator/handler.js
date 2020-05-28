const { BUCKET, FILE } = process.env

const AWS = require('aws-sdk')

const s3 = new AWS.S3()
const { promisify } = require('util')

const getS3Object = promisify(s3.getObject).bind(s3)


const readFile = async (bucketName, fileName) => {
  const params = {
    Bucket: bucketName,
    Key: fileName,
  }

  const data = await getS3Object(params)
  return data.Body.toString('utf-8')
}

module.exports.calculateGSDIndex = async (event, context) => {
  try {
    const s3FileContent = await readFile(BUCKET, FILE)
    console.log('+++s3FileContent', s3FileContent)

    const response = {
      statusCode: 200,
      body: JSON.stringify({
        content: s3FileContent,
      })
    }
    return response
  } catch(err) {
    return {
      statusCode: err.statusCode || 400,
      body: err.message || JSON.stringify(err.message)
    }
  }
}
