const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const appSource = fs.readFileSync('app.js', 'utf8');
const toolsSource = fs.readFileSync('herramientas.js', 'utf8');
function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'source boundaries exist');
  return source.slice(a, b);
}
const saleFunction = between(appSource, 'function finalizeSale(printAfter){', 'function saveSale(){');
const restoreFunctions = between(toolsSource, 'function zipperDataKeys(storage){', 'function previewExampleReceipt(){');

class Storage {
  constructor(seed = {}, failures = []) {
    this.values = new Map(Object.entries(seed));
    this.failures = failures;
    for (const [key, value] of this.values) this.expose(key, value);
  }
  expose(key, value) {
    Object.defineProperty(this, key, { configurable: true, enumerable: true, writable: true, value });
  }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) {
    value = String(value);
    const index = this.failures.findIndex(rule => rule(key, value));
    if (index >= 0) {
      this.failures.splice(index, 1);
      throw new Error('QuotaExceededError');
    }
    this.values.set(key, value);
    this.expose(key, value);
  }
  removeItem(key) { this.values.delete(key); delete this[key]; }
}

const clientJson = JSON.stringify([{ id: 'client-1', name: 'Test client' }]);
const oldProducts = JSON.stringify([{ id: 'product-old', name: 'Old product', stock: 4 }]);
const newProducts = JSON.stringify([{ id: 'product-1', name: 'Test product', stock: 5 }]);
const oldSales = JSON.stringify([]);
const newSales = JSON.stringify([{ id: 'sale-1', clienteId: 'client-1', items: [{ qty: 1, price: 2000 }] }]);
const oldPayments = JSON.stringify([]);
const newPayments = JSON.stringify([{ id: 'payment-1', saleId: 'sale-1', clienteId: 'client-1', amount: 500, paymentMethod: 'cash' }]);
const expenses = JSON.stringify([]);
const backup = {
  app: 'Distribuidora zipper',
  schemaVersion: 1,
  data: {
    zipperClientes: clientJson,
    zipperProductos: newProducts,
    zipperComprobantes: newSales,
    zipperPagos: newPayments,
    zipperGastosCaja: expenses
  }
};
function restoreContext(failures = []) {
  const storage = new Storage({
    zipperClientes: clientJson,
    zipperProductos: oldProducts,
    zipperComprobantes: oldSales,
    zipperPagos: oldPayments,
    zipperGastosCaja: expenses
  }, failures);
  const session = new Storage();
  const status = { textContent: '' };
  const alerts = [];
  const input = { files: [{ size: 1, text: async () => JSON.stringify(backup) }], value: '' };
  const window = { location: { reload() {} } };
  const document = { body: { dataset: {} } };
  const call = new Function(
    'localStorage', 'sessionStorage', 'window', 'document', '$', 'confirmDelete',
    'alert', 'setTimeout', 'input',
    restoreFunctions + '\nreturn restoreZipperBackup(input);'
  );
  return {
    storage, session, status, alerts, window, document, input,
    run: () => call(storage, session, window, document, () => status, (title, message, fn) => fn(), msg => alerts.push(msg), () => {}, input)
  };
}
function saleContext(failures = [], lock = null, paymentLock = null) {
  const storage = new Storage({ zipperProductos: oldProducts }, failures);
  if (lock) storage.setItem('zipperStorageRecoveryFailed', lock);
  const session = new Storage();
  if (paymentLock) session.setItem('zipperStorageRecoveryFailed', paymentLock);
  const product = { id: 'product-old', name: 'Test product', stock: 4, price: 2000, pricePurchase: 1000 };
  const client = { id: 'client-1', name: 'Test client', routeWeek: 'A', routeDay: 'Lunes' };
  const elements = {
    salePaymentMethod: { value: 'partial' },
    salePartialAmount: { value: '500' },
    salePartialMethod: { value: 'cash' },
    saleStatus: { textContent: '' },
    saveOptions: { classList: { add() {}, remove() {} } },
    cartSection: { classList: { add() {} } }
  };
  const alerts = [];
  const context = {
    window: {}, localStorage: storage, sessionStorage: session,
    document: { body: { dataset: {} } },
    alert: message => alerts.push(message),
    $: id => elements[id] || { classList: { add() {}, remove() {} } },
    cart: [{ productId: 'product-old', qty: 1 }],
    editingSaleId: '', selectedClientId: 'client-1',
    cartData: () => ({ items: [{ productId: 'product-old', baseProductId: 'product-old', desc: 'Test product', qty: 1, price: 2000, purchasePrice: 1000 }], total: 2000, cost: 1000 }),
    productById: () => product,
    clientById: () => client,
    getRawProducts: () => [{ ...product }],
    getSales: () => [],
    getPayments: () => [],
    viewedRoute: () => null,
    clientRoute: () => null,
    saleItemStockId: () => 'product-old',
    readArray: key => JSON.parse(storage.getItem(key) || '[]'),
    writeArray: (key, rows) => { try { storage.setItem(key, JSON.stringify(rows)); return true; } catch { return false; } },
    uid: () => 'new-id',
    localDate: () => '2026-10-27',
    renderInventory() {}, renderPrint() {}, renderHome() {}, sendReceiptToSystem() {},
    closeSaveOptions() {}, markVisited() {}
  };
  return { context, storage, session, alerts };
}

test('restore writes sales and payments and clears recovery locks', async () => {
  const c = restoreContext();
  await c.run();
  assert.equal(c.storage.getItem('zipperComprobantes'), newSales);
  assert.equal(c.storage.getItem('zipperPagos'), newPayments);
  assert.equal(c.storage.getItem('zipperStorageRecoveryFailed'), null);
  assert.equal(c.session.getItem('zipperStorageRecoveryFailed'), null);
});
test('restore write failure rolls back the prior data', async () => {
  const c = restoreContext([(key, value) => key === 'zipperComprobantes' && value === newSales]);
  await c.run();
  assert.equal(c.storage.getItem('zipperProductos'), oldProducts);
  assert.equal(c.storage.getItem('zipperComprobantes'), oldSales);
  assert.equal(c.storage.getItem('zipperPagos'), oldPayments);
  assert.equal(c.storage.getItem('zipperStorageRecoveryFailed'), null);
});
test('incomplete restore rollback persists a sales lock', async () => {
  let targetFailed = false;
  const c = restoreContext([
    (key, value) => { if (!targetFailed && key === 'zipperComprobantes' && value === newSales) { targetFailed = true; return true; } return false; },
    (key, value) => targetFailed && key === 'zipperProductos' && value === oldProducts
  ]);
  await c.run();
  assert.equal(c.storage.getItem('zipperStorageRecoveryFailed'), '1');
  assert.equal(c.session.getItem('zipperStorageRecoveryFailed'), '1');
});
test('partial sale write failure rolls back stock, sales and payments', () => {
  const c = saleContext([(key, value) => key === 'zipperComprobantes' && value !== oldSales]);
  const context = c.context;
  vm.runInNewContext(saleFunction + '\nfinalizeSale(false);', context);
  assert.equal(c.storage.getItem('zipperProductos'), oldProducts);
  assert.equal(c.storage.getItem('zipperComprobantes'), null);
  assert.equal(c.storage.getItem('zipperPagos'), null);
  assert.equal(c.storage.getItem('zipperStorageRecoveryFailed'), null);
});
test('sales are blocked when the persistent recovery lock is active', () => {
  const c = saleContext([], '1');
  vm.runInNewContext(saleFunction + '\nfinalizeSale(false);', c.context);
  assert.equal(c.alerts.length, 1);
  assert.equal(c.storage.getItem('zipperComprobantes'), null);
});
test('sales are blocked when the session recovery lock is active', () => {
  const c = saleContext([], null, '1');
  vm.runInNewContext(saleFunction + '\nfinalizeSale(false);', c.context);
  assert.equal(c.alerts.length, 1);
  assert.equal(c.storage.getItem('zipperComprobantes'), null);
});
