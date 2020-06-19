import chai from 'chai'
import chaiHttp from 'chai-http'

import app from '../../src/index'

const { expect } = chai
chai.use(chaiHttp)

describe('App e2e', () => {
  describe('GET /', () => {
    it('should hello world', () => {
      chai.request(app)
        .get('/')
        .then((res) => {
          expect(res).to.have.status(200)
          expect(res.body).eql({
            hello: 'world!',
          })
        })
    })
  })
})
