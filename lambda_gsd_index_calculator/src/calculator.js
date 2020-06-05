module.exports.handler = (event, context, callback) => {
  console.log('+++event', event)
  console.log('+++context', context)
  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: "SQS event processed.",
      input: event,
    }),
  }

  console.log('+++response', response)
  callback(null, response)
}
