import { Counter, BigDecimal, Gauge } from '@sentio/sdk';
import { event } from './types/sui/0x04e20ddf36af412a4096f9014f4a565af9e812db9a05cc40254846cf6ed0ad91.js';
import { PRICE_MAP, SPONSORED_PRICE_FEEDS } from './pyth.js';
import { SuiContext } from '@sentio/sdk/sui';

// Metrics
const totalPriceUpdates = Counter.register('total_price_updates');

const sponsoredPriceUpdates = Gauge.register('sponsored_price_updates');
const nonSponsoredPriceUpdates = Gauge.register('non_sponsored_price_updates');
const totalTransactionFees = Counter.register('total_transaction_fee');

event.bind({ startCheckpoint: 37777777n }).onEventPriceFeedUpdateEvent(
  async (evt: event.PriceFeedUpdateEventInstance, ctx: SuiContext) => {
    const priceId = decodeBytesArray(
      evt.data_decoded.price_feed.price_identifier.bytes
    );
    const symbol = PRICE_MAP.get(priceId) || 'Unknown';
    const sender = evt.sender;

    let assetType = 'Unknown';
    if (symbol.startsWith('Commodities.')) {
      assetType = 'Commodities';
    } else if (symbol.startsWith('Crypto.')) {
      assetType = 'Crypto';
    } else if (symbol.startsWith('FX.')) {
      assetType = 'FX';
    } else if (symbol.startsWith('Equity.')) {
      assetType = 'Equity';
    } else if (symbol.startsWith('Metal.')) {
      assetType = 'Metal';
    } else if (symbol.startsWith('Rates.')) {
      assetType = 'Rates';
    }

    const labels = { priceId, symbol, assetType };

    totalPriceUpdates.add(ctx, 1, labels);

    // Sponsored and Non-Sponsored price update
    if (SPONSORED_PRICE_FEEDS.has(priceId)) {
      sponsoredPriceUpdates.record(ctx, 1, labels);
    } else {
      nonSponsoredPriceUpdates.record(ctx, 1, labels);
    }

    // Transaction fee
    const transactionCost = new BigDecimal(
      ctx.transaction.effects?.gasUsed?.computationCost || 0
    )
      .plus(new BigDecimal(ctx.transaction.effects?.gasUsed?.storageCost || 0))
      .minus(
        new BigDecimal(ctx.transaction.effects?.gasUsed?.storageRebate || 0)
      );

    totalTransactionFees.add(ctx, transactionCost, { sender });

    ctx.eventLogger.emit('Price Update', {
      distinctId: sender,
      symbol: symbol,
      assetType: assetType,
      message: `Price update for ${symbol}`,
    });
  },
  { resourceChanges: true }
);

// Capture contracts using Pyth
// event.bind().onEventPriceFeedUpdateEvent(async (event, ctx) => {
//   // Get the price info object ID from the object changes
//   const priceInfoObjectChanges = ctx.transaction.objectChanges?.filter(
//     (change) =>
//       change.type === 'mutated' &&
//       change.objectType ===
//         '0x8d97f1cd6ac663735be08d1d2b6d02a159e711586461306ce60a2b7a6a565a9e::price_info::PriceInfoObject'
//   );
//   if (priceInfoObjectChanges && priceInfoObjectChanges.length > 0) {
//     // Check if the path is a valid Sui object ID
//     const objId = priceInfoObjectChanges[0].objectId;
//     ctx.meter
//       .Counter('unique_contracts_addresses')
//       .add(1, { contract_address: objId.toString('hex') });
//   }
// });

export function decodeBytesArray(bytes: number[]): string {
  return '0x' + Buffer.from(bytes).toString('hex');
}
