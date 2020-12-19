import AWS from 'aws-sdk'
import moment from 'moment'

const credentials = new AWS.SharedIniFileCredentials({ profile: process.env.AWS_PROFILE })
AWS.config.credentials = credentials

console.log('+++process.env sns-region', process.env.AWS_RESOURCE_REGION)

AWS.config.update({
  region: process.env.AWS_RESOURCE_REGION,
})

// TODO:
const TOPIC_ARN = process.env.SNS_TOPIC_ARN

class Notifier {
  constructor() {
    this.sns = new AWS.SNS()
  }

  async subscribe(mailAddress) {
    try {
      const params = {
        Protocol: 'email',
        TopicArn: TOPIC_ARN,
        Endpoint: mailAddress,
        ReturnSubscriptionArn: true,
      }

      const test = await this.sns.subscribe(params).promise()
      console.log('+++params', params, test)
      return mailAddress
    } catch (err) {
      console.log('err', err)
    }
  }

  async publish(subject, message) {
    try {
      const params = {
        Subject: `${subject}`,
        Message: `${message} at ${moment().format('LLLL')}`,
        TopicArn: TOPIC_ARN,
      }

      const test = await this.sns.publish(params).promise()
      console.log('+++params', params, test)
    } catch (err) {
      console.log('err', err)
    }
  }
}

export default Notifier
