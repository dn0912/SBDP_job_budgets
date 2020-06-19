import express from 'express'

const app = express()
const port = process.env.PORT || 3000

app.get('/', (req, res) => res.status(200).json({
  hello: 'world!',
}))

app.listen(
  port,
  () => console.log(`App listening at http://localhost:${port}`),
)

export default app
