import AWS from 'aws-sdk'
import moment from 'moment'

const credentials = new AWS.SharedIniFileCredentials({ profile: process.env.AWS_PROFILE })
AWS.config.credentials = credentials

AWS.config.update({
  region: process.env.AWS_RESOURCE_REGION,
})

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

      await this.sns.subscribe(params).promise()
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

      await this.sns.publish(params).promise()
    } catch (err) {
      console.log('err', err)
    }
  }
}

export default Notifier
