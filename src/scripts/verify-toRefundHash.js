const mongoose = require('mongoose')
const config = require('../config')
const BN = require('bignumber.js')

const mongooseOnError = (err) => {
  console.error(err)
  process.exit(1)
}

mongoose
  .connect(config.database.uri, {
    useNewUrlParser: true
  })
  .catch(mongooseOnError)

const Bluebird = require('bluebird')
const Order = require('../models/Order')

async function main() {
  const orders = await Order.find({
    status: 'AGENT_REFUNDED'
  })
    .sort('-createdAt')
    .exec()

  const total = orders.length
  console.log('Total Orders', total)
  let index = 0

  await Bluebird.map(
    orders,
    async (order) => {
      const log = (message) =>
        console.log(`[${++index}/${total}] [${order.from}-${order.to}] ${order.orderId} - ${message}`)
      const toClient = await order.toClient()

      let toRefundTx

      try {
        toRefundTx = await toClient.swap.findRefundSwapTransaction(
          {
            value: BN(order.toAmount),
            recipientAddress: order.toAddress,
            refundAddress: order.toCounterPartyAddress,
            secretHash: order.secretHash,
            expiration: order.nodeSwapExpiration
          },
          order.toFundHash
        )

        if (!toRefundTx) {
          log('Not refunded yet')
          return
        }
      } catch (e) {
        log('Not refunded yet')
        return
      }

      if (order.toRefundHash === toRefundTx.hash) {
        log('Verified')
        return
      }

      log(`Mismatch - On Record ${order.toRefundHash} vs On Chain ${toRefundTx.hash}`)

      order.addTx('toRefundHash', toRefundTx)
      await order.save()

      if (Math.random() < 0.5) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    },
    { concurrency: 10 }
  )

  console.log('Done')
  process.exit(0)
}

main()
