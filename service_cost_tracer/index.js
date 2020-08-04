'use strict'

const AWSXRay = require('aws-xray-sdk-core')
const AWS = AWSXRay.captureAWS(require('aws-sdk'))

// const override = (object, methodName, callback) => {
//   object.prototype[methodName] = callback((object[methodName]))
// }

// const before = (extraBehaviour) => {
//   return (originalFunc) => {
//     return () => {
//       extraBehaviour.apply(this, arguments)
//       return originalFunc.apply(this, arguments)
//     }
//   }
// }

// override(AWS.SQS, 'sendMessage', (original) => {
//   return (params, jobId, callback) => {
//     const returnValue = original.apply(this, arguments)
//     console.log('+++sendMessage', jobId)
//     return returnValue
//   }
// })

// AWS.SQS.prototype.sendTracedMessage = async function(payload, jobId) {
AWS.SQS.prototype.sendTracedMessage = function(payload, jobId, callback) {
  console.log('+++sendTracedMessage', jobId)

  // const result = await this.sendMessage(payload).promise()
  // const result = this.sendMessage(payload, callback)

  // console.log('+++resulst', result)
  // return result
  return this.sendMessage(payload, callback)
}

AWS.SQS.prototype.helloWorldDuc = function () {
  console.log('+++hello world Duc')
}

// class DucSQS extends AWS.SQS {
//   sendDucTracedMessage(payload, jobId, callback) {
//     console.log('extended one HELLO WORLD', jobId)

//     this.sendMessage(payload, callback)
//   }

//   sendMessage(payload, callback) {
//     console.log('original sendMessage')
//     super.sendMessage(payload, callback)
//   }
// }

// AWS.DucSQS = DucSQS
module.exports = AWS
