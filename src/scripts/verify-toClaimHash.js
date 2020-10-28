const mongoose = require('mongoose')
const config = require('../config')

const mongooseOnError = err => {
  console.error(err)
  process.exit(1)
}

mongoose
  .connect(config.database.uri, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true
  })
  .catch(mongooseOnError)

const Bluebird = require('bluebird')
const Order = require('../models/Order')

async function main () {
  const orders = await Order.find({
    status: {
      $ne: 'QUOTE'
    }
  }).sort('-createdAt').exec()

  const total = orders.length
  console.log('Total Orders', total)
  let index = 0

  await Bluebird.map(orders, async order => {
    const log = message => console.log(`[${++index}/${total}] [${order.from}-${order.to}] ${order.orderId} - ${message}`)
    const toClient = order.toClient()

    let toClaimHash

    if (!(
      order.toFundHash &&
      order.toAddress &&
      order.toCounterPartyAddress &&
      order.secretHash &&
      order.nodeSwapExpiration
    )) return

    try {
      const toClaimTx = await toClient.swap.findClaimSwapTransaction(
        order.toFundHash,
        order.toAddress,
        order.toCounterPartyAddress,
        order.secretHash,
        order.nodeSwapExpiration
      )

      if (!toClaimTx) {
        log('Not claimed yet')
        return
      }

      toClaimHash = toClaimTx.hash
    } catch (e) {
      log('Not claimed yet')
      return
    }

    if (order.toClaimHash === toClaimHash) {
      log('Verified')
      return
    }

    log(`Mismatch - On Record ${order.toClaimHash} vs On Chain ${toClaimHash}`)

    order.toClaimHash = toClaimHash
    await order.save()

    if (Math.random() < 0.5) {
      await new Promise((resolve, reject) => setTimeout(resolve, 1000))
    }
  }, { concurrency: 10 })

  console.log('Done')
  process.exit(0)
}

main()