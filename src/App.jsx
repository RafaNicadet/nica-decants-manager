import React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Sprout, LayoutDashboard, Package, Users, ReceiptText, Wallet,
  LogOut, Search, AlertTriangle, RefreshCw, ShieldCheck, LockKeyhole
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "./supabase";
const money = (value) => new Intl.NumberFormat("es-NI", {
  style: "currency", currency: "NIO", maximumFractionDigits: 2
}).format(Number(value || 0));

function Login({ onNotice }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("login");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    onNotice("");
    try {
      const result = mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.resetPasswordForEmail(email);
      if (result.error) throw result.error;
      onNotice(mode === "login"
        ? "Sesión iniciada."
        : "Si el correo está registrado, recibirás instrucciones para restablecer la contraseña.");
    } catch (error) {
      onNotice(error.message || "No se pudo completar la solicitud.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="login-wrap">
    <section className="login-card">
      <div className="brand-mark"><Sprout size={30}/></div>
      <p className="eyebrow">GESTIÓN COMERCIAL</p>
      <h1>Nica Decants <span>Manager</span></h1>
      <p className="muted">Ingresa con la cuenta que te haya creado el administrador.</p>
      <form onSubmit={submit} className="stack">
        <label>Correo electrónico
          <input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="tu@correo.com"/>
        </label>
        {mode === "login" && <label>Contraseña
          <input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/>
        </label>}
        <button className="primary" disabled={busy}>{busy ? "Procesando…" : mode === "login" ? "Iniciar sesión" : "Enviar enlace de recuperación"}</button>
      </form>
      <button className="text-button" onClick={()=>setMode(mode === "login" ? "reset" : "login")}>
        {mode === "login" ? "¿Olvidaste tu contraseña?" : "Volver al inicio de sesión"}
      </button>
      <p className="small muted"><LockKeyhole size={13}/> Acceso protegido por Supabase Auth y políticas de base de datos.</p>
    </section>
  </main>;
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [usdNioRate, setUsdNioRate] = useState("37.11");
  const [rateSaving, setRateSaving] = useState(false);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerBalances, setCustomerBalances] = useState({});
  const [costProducts, setCostProducts] = useState([]);
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [purchaseHistoryLoading, setPurchaseHistoryLoading] = useState(false);
  const [purchaseHistoryError, setPurchaseHistoryError] = useState("");

const [purchaseForm, setPurchaseForm] = useState({
  product_id: "",
  quantity: "1",
  amount_original: "",
  currency: "USD",
  exchange_rate: "37.11",
  bank_name: "BAC",
  payment_method: "card",
  supplier: "",
  note: ""
});
const [purchaseSaving, setPurchaseSaving] = useState(false);

  const [section, setSection] = useState("Inicio");
  const [search, setSearch] = useState("");
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [inventoryEntryOpen, setInventoryEntryOpen] = useState(false);
  const [inventoryAdjustmentOpen, setInventoryAdjustmentOpen] = useState(false);
  const [adjustmentProductId, setAdjustmentProductId] = useState("");
  const [adjustmentQuantity, setAdjustmentQuantity] = useState("");
  const [adjustmentNote, setAdjustmentNote] = useState("");

  const [inventoryEntryProductId, setInventoryEntryProductId] = useState("");
  const [inventoryEntryQuantity, setInventoryEntryQuantity] = useState("1");
  const [inventoryEntryUnitCost, setInventoryEntryUnitCost] = useState("");
  const [inventoryEntrySupplier, setInventoryEntrySupplier] = useState("");
  const [inventoryEntryNote, setInventoryEntryNote] = useState("");

  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [savingForm, setSavingForm] = useState(false);
  const [productForm, setProductForm] = useState({
    sku: "", name: "", category: "General", kind: "finished",
    sell_unit: "unidad", low_stock_threshold: "0", sale_price: "0"
  });
  const [customerForm, setCustomerForm] = useState({
    full_name: "", phone: "", email: ""
  });
  const [saleCart, setSaleCart] = useState([]);
  const [selectedSaleProduct, setSelectedSaleProduct] = useState("");
  const [saleQuantity, setSaleQuantity] = useState("1");
  const [saleCustomerId, setSaleCustomerId] = useState("");
  const [saleCustomerName, setSaleCustomerName] = useState("");
  const [saleCustomerPhone, setSaleCustomerPhone] = useState("");
  const [saleDiscount, setSaleDiscount] = useState("0");
  const [salePaymentAmount, setSalePaymentAmount] = useState("0");
  const [salePaymentMethod, setSalePaymentMethod] = useState("cash");
  const [salePaymentReference, setSalePaymentReference] = useState("");
  const [saleNotes, setSaleNotes] = useState("");
  const [saleDeliveryType, setSaleDeliveryType] = useState("none");
  const [saleDeliveryAddress, setSaleDeliveryAddress] = useState("");
  const [saleDeliveryCharge, setSaleDeliveryCharge] = useState("0");
  const [saleDeliveryCost, setSaleDeliveryCost] = useState("0");


  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  // FINANCE_MODULE_V1
  const [financeMonth, setFinanceMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [financeExpenses, setFinanceExpenses] = useState([]);
  const [financeSales, setFinanceSales] = useState([]);
  const [financePayments, setFinancePayments] = useState([]);
  const [financeMovements, setFinanceMovements] = useState([]);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeError, setFinanceError] = useState("");
  const [expenseEditing, setExpenseEditing] = useState(null);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    description: "",
    category: "Publicidad",
    amount: "",
    currency: "NIO",
    expense_date: new Date().toLocaleDateString("en-CA"),
    payment_method: "transfer",
    receipt_path: ""
  });

  const [imports, setImports] = useState([]);
  const [importsLoading, setImportsLoading] = useState(false);
  const [packageForm, setPackageForm] = useState({
    shipment_id: "", tracking_reference: "", weight_lb: "",
    rate_per_lb: "", status: "pending", notes: ""
  });
  const [paymentForm, setPaymentForm] = useState({
    shipment_id: "", amount: "",
    payment_type: "supplier",
    store_name: "",
    bank_name: "BAC",
    currency: "USD",
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: "card", reference: "", notes: ""
  });

  const [importForm, setImportForm] = useState({
    supplier: "",
    origin_country: "Estados Unidos",
    shipping_agency: "",
    transport_mode: "air",
    reference: "",
    status: "pending",
    ordered_at: new Date().toISOString().slice(0, 10),
    estimated_arrival: "",
    purchase_total: "0",
    package_weight_lb: "0",
    package_rate_per_lb: "7",
    exchange_rate: "37.11",
    notes: ""
  });

  const [importItems, setImportItems] = useState([
    { product_id: "", quantity: "1", amount_original: "", currency: "USD" }
  ]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let alive = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) setNotice(error.message);
      setSession(data?.session ?? null);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) { setProfile(null); setProducts([]); setCustomers([]); }
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session || !supabase) return;
    let alive = true;
    async function load() {
      setLoading(true);
      setNotice("");
      const [profileResult, productResult, customerResult] = await Promise.all([
        supabase.from("profiles").select("display_name, role, active").eq("user_id", session.user.id).maybeSingle(),
        supabase.from("products").select("id, sku, name, category, kind, sell_unit, stock_qty, low_stock_threshold, sale_price, active").eq("active", true).order("name"),
        supabase.from("customers").select("id, full_name, phone, email, active, created_at").eq("active", true).order("full_name")
      ]);
      if (!alive) return;
      if (profileResult.error) setNotice(`No se pudo leer tu perfil: ${profileResult.error.message}`);
      else if (!profileResult.data || !profileResult.data.active) setNotice("Tu usuario no tiene un perfil activo. Pide al administrador que lo configure.");
      else setProfile(profileResult.data);
      if (productResult.error) setNotice(`No se pudieron cargar los productos: ${productResult.error.message}`);
      else setProducts(productResult.data ?? []);
      if (customerResult.error) setNotice(`No se pudieron cargar los clientes: ${customerResult.error.message}`);
      else setCustomers(customerResult.data ?? []);
      setLoading(false);
    }
    load();
    return () => { alive = false; };
  }, [session]);

  async function loadImports() {
    if (!supabase || profile?.role !== "admin") return;
    setImportsLoading(true);
    const { data, error } = await supabase
      .from("import_shipments")
      .select("*, import_packages(*), import_payments(*), import_shipment_items(*)")
      .order("created_at", { ascending: false });
    setImportsLoading(false);
    if (error) {
      setNotice("No se pudieron cargar las importaciones: " + error.message);
      return;
    }
    setImports(data ?? []);
  }

  async function saveImport(event) {
    event.preventDefault();
    if (!supabase || profile?.role !== "admin") {
      setNotice("Solo un administrador puede registrar importaciones.");
      return;
    }
    if (!importForm.supplier.trim() || !importForm.shipping_agency.trim()) {
      setNotice("Completa el proveedor y la agencia de envío.");
      return;
    }
    const purchaseTotal = Number(importForm.purchase_total);
    const packageWeight = Number(importForm.package_weight_lb);
    const packageRateUsd = Number(importForm.package_rate_per_lb);
    const exchangeRate = Number(importForm.exchange_rate);
    const packageRate = packageRateUsd * exchangeRate;

    if (!Number.isFinite(purchaseTotal) || purchaseTotal < 0) {
      setNotice("El total de compra debe ser cero o mayor.");
      return;
    }
    if (!Number.isFinite(packageWeight) || packageWeight < 0 ||
        !Number.isFinite(packageRateUsd) || packageRateUsd < 0 ||
        !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      setNotice("Revisa el peso, la tarifa y la tasa de cambio.");
      return;
    }
    if ((packageWeight > 0 && packageRateUsd <= 0) ||
        (packageRateUsd > 0 && packageWeight <= 0)) {
      setNotice("Para registrar el envío, completa el peso y la tarifa.");
      return;
    }

    setSavingForm(true);
    const payload = {
      supplier: importForm.supplier.trim(),
      origin_country: importForm.origin_country,
      shipping_agency: importForm.shipping_agency.trim(),
      transport_mode: importForm.transport_mode,
      reference: importForm.reference.trim() || null,
      status: importForm.status,
      ordered_at: importForm.ordered_at,
      estimated_arrival: importForm.estimated_arrival || null,
      purchase_total: purchaseTotal,
      exchange_rate: exchangeRate,
      notes: importForm.notes.trim() || null
    };
    const { data: shipment, error } = await supabase
      .from("import_shipments")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      setSavingForm(false);
      setNotice("No se pudo guardar la importación: " + error.message);
      return;
    }

    const lines = importItems.filter(item => item.product_id && Number(item.quantity) > 0 && Number(item.amount_original) > 0);
    if (lines.length) {
      const { error: linesError } = await supabase.from("import_shipment_items").insert(lines.map(item => ({
        shipment_id: shipment.id,
        product_id: item.product_id,
        quantity: Number(item.quantity),
        currency: item.currency,
        amount_original: Number(item.amount_original),
        exchange_rate: item.currency === "USD" ? exchangeRate : 1
      })));
      if (linesError) {
        setSavingForm(false);
        setNotice("La importación se guardó, pero no se pudieron asociar los productos: " + linesError.message);
        await loadImports();
        return;
      }
    }

    if (packageWeight > 0 && packageRate > 0) {
      const { error: packageError } = await supabase.from("import_packages").insert({
        shipment_id: shipment.id,
        weight_lb: packageWeight,
        rate_per_lb: packageRate,
        rate_per_lb_usd: packageRateUsd,
        status: importForm.status === "received" ? "received" :
                importForm.status === "in_transit" ? "in_transit" : "pending"
      });
      if (packageError) {
        setSavingForm(false);
        setNotice("La importación se guardó, pero falló el registro del envío: " + packageError.message);
        await loadImports();
        return;
      }
    }

    setSavingForm(false);
    setImportForm({
      supplier: "",
      origin_country: "Estados Unidos",
      shipping_agency: "",
      transport_mode: "air",
      reference: "",
      status: "pending",
      ordered_at: new Date().toISOString().slice(0, 10),
      estimated_arrival: "",
      purchase_total: "0",
      package_weight_lb: "0",
      package_rate_per_lb: "7",
    exchange_rate: "37.11",
      notes: ""
    });
    setImportItems([{product_id:"",quantity:"1",amount_original:"",currency:"USD"}]);
    setNotice("Importación guardada correctamente.");
    await loadImports();
  }

  async function saveExtraPackage(event) {
    event.preventDefault();
    const weight = Number(packageForm.weight_lb);
    const selectedShipment = imports.find(i => i.id === packageForm.shipment_id);

    if (!selectedShipment || !Number.isFinite(weight) || weight <= 0) {
      setNotice("Selecciona una importación e introduce un peso mayor que cero.");
      return;
    }

    const exchangeRate = Number(selectedShipment.exchange_rate);
    const rateUsd = selectedShipment.transport_mode === "sea" ? 2.60 : 7.00;
    const rate = rateUsd * exchangeRate;

    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      setNotice("Esta importación no tiene una tasa de cambio registrada. No se puede calcular el envío.");
      return;
    }

    setSavingForm(true);
    const { error } = await supabase.from("import_packages").insert({
      shipment_id: packageForm.shipment_id,
      tracking_reference: packageForm.tracking_reference.trim() || null,
      weight_lb: weight,
      rate_per_lb: rate,
      rate_per_lb_usd: rateUsd,
      status: packageForm.status,
      notes: packageForm.notes.trim() || null
    });
    setSavingForm(false);

    if (error) {
      setNotice("No se pudo guardar el paquete: " + error.message);
      return;
    }

    const shipmentId = packageForm.shipment_id;
    setPackageForm({
      shipment_id: shipmentId, tracking_reference: "",
      weight_lb: "", rate_per_lb: "", status: "pending", notes: ""
    });
    setNotice("Paquete agregado correctamente.");
    await loadImports();
  }

  async function receiveImport(shipment) {
    if (!window.confirm(`¿Registrar en inventario los productos pendientes de ${shipment.supplier}?`)) return;
    setSavingForm(true);
    const { data, error } = await supabase.rpc("receive_import_shipment", {p_shipment_id: shipment.id});
    setSavingForm(false);
    if (error) { setNotice("No se pudo recibir la importación: " + error.message); return; }
    setNotice(data?.message || "Importación recibida y agregada al inventario.");
    await Promise.all([loadImports(), refresh(), loadPurchaseHistory()]);
  }

  async function saveImportPayment(event) {
    event.preventDefault();

    const amountOriginal = Number(paymentForm.amount);
    const selectedShipment = imports.find(i => i.id === paymentForm.shipment_id);
    const exchangeRate = paymentForm.currency === "USD"
      ? Number(usdNioRate)
      : 1;

    if (!selectedShipment || !Number.isFinite(amountOriginal) || amountOriginal <= 0) {
      setNotice("Selecciona una importación e introduce un importe mayor que cero.");
      return;
    }

    if (!["BAC", "Lafise", "Banpro"].includes(paymentForm.bank_name)) {
      setNotice("Selecciona un banco válido.");
      return;
    }

    if (paymentForm.bank_name === "Banpro" && paymentForm.currency !== "NIO") {
      setNotice("Banpro solo permite registrar pagos en córdobas.");
      return;
    }

    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      setNotice("La importación no tiene una tasa de cambio válida.");
      return;
    }

    const amountNio = amountOriginal * exchangeRate;

    setSavingForm(true);
    const { error } = await supabase.from("import_payments").insert({
      shipment_id: paymentForm.shipment_id,
      amount: amountNio,
      amount_original: amountOriginal,
      currency: paymentForm.currency,
      exchange_rate: exchangeRate,
      payment_type: paymentForm.payment_type,
      store_name: paymentForm.store_name.trim() || null,
      bank_name: paymentForm.bank_name,
      payment_date: paymentForm.payment_date,
      payment_method: paymentForm.payment_method,
      reference: paymentForm.reference.trim() || null,
      notes: paymentForm.notes.trim() || null
    });
    setSavingForm(false);

    if (error) {
      setNotice("No se pudo registrar el abono: " + error.message);
      return;
    }

    const shipmentId = paymentForm.shipment_id;
    setPaymentForm({
      shipment_id: shipmentId, amount: "",
      payment_type: "supplier",
      store_name: "",
      bank_name: "BAC",
      currency: "USD",
      payment_date: new Date().toISOString().slice(0, 10),
      payment_method: "card", reference: "", notes: ""
    });
    setNotice("Pago registrado correctamente.");
    await loadImports();
  }

  const filteredProducts = useMemo(() => products.filter(p =>
    `${p.name} ${p.sku ?? ""} ${p.category ?? ""}`.toLowerCase().includes(search.toLowerCase())
  ), [products, search]);


  function openProductForm(product = null) {
    setEditingProduct(product);
    setProductForm(product ? {
      sku: product.sku || "",
      name: product.name,
      category: product.category || "General",
      kind: product.kind,
      sell_unit: product.sell_unit || "unidad",
      low_stock_threshold: String(product.low_stock_threshold ?? 0),
      sale_price: String(product.sale_price ?? 0)
    } : {
      sku: "", name: "", category: "General", kind: "finished",
      sell_unit: "unidad", low_stock_threshold: "0", sale_price: "0"
    });
    setProductFormOpen(true);
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (!supabase || profile?.role !== "admin") {
      setNotice("Solo un administrador puede guardar productos.");
      return;
    }
    setSavingForm(true);
    const payload = {
      sku: productForm.sku.trim() || null,
      name: productForm.name.trim(),
      category: productForm.category.trim() || "General",
      kind: productForm.kind,
      sell_unit: productForm.sell_unit.trim() || "unidad",
      low_stock_threshold: Number(productForm.low_stock_threshold),
      sale_price: Number(productForm.sale_price)
    };
    const result = editingProduct
      ? await supabase.from("products").update(payload).eq("id", editingProduct.id)
      : await supabase.from("products").insert(payload);
    setSavingForm(false);
    if (result.error) {
      setNotice("No se pudo guardar el producto: " + result.error.message);
      return;
    }
    setProductFormOpen(false);
    const wasEditing = Boolean(editingProduct);
    setEditingProduct(null);
    await refresh();
    setNotice(wasEditing ? "Producto actualizado." : "Producto agregado.");
  }


  
  
  async function saveInventoryAdjustment(event) {
    event.preventDefault();

    if (!supabase || profile?.role !== "admin") {
      setNotice("Solo un administrador puede ajustar el inventario.");
      return;
    }

    const quantity = Number(adjustmentQuantity);

    if (!adjustmentProductId) {
      setNotice("Selecciona un producto.");
      return;
    }

    if (!adjustmentQuantity.trim() || !Number.isFinite(quantity) || quantity < 0) {
      setNotice("Introduce la cantidad real. Puede ser cero o cualquier cantidad positiva.");
      return;
    }

    const product = products.find(p => p.id === adjustmentProductId);
    if (!product) {
      setNotice("No se encontró el producto seleccionado.");
      return;
    }

    const confirmed = window.confirm(
      `¿Confirmas que las existencias reales de "${product.name}" son ${quantity} ${product.sell_unit}?`
    );
    if (!confirmed) return;

    setSavingForm(true);

    const { data, error } = await supabase.rpc("adjust_inventory", {
      p_product_id: adjustmentProductId,
      p_target_quantity: quantity,
      p_note: adjustmentNote.trim() || "Corrección por conteo físico"
    });

    setSavingForm(false);

    if (error) {
      setNotice("No se pudo ajustar el inventario: " + error.message);
      return;
    }

    setInventoryAdjustmentOpen(false);
    setAdjustmentProductId("");
    setAdjustmentQuantity("");
    setAdjustmentNote("");

    await refresh();
    setNotice(
      `Inventario ajustado. Cantidad anterior: ${data.previous_quantity}; cantidad actual: ${data.new_quantity}; diferencia: ${data.difference}.`
    );
  }

async function saveInventoryEntry(event) {
    event.preventDefault();

    if (!supabase || profile?.role !== "admin") {
      setNotice("Solo un administrador puede registrar entradas de inventario.");
      return;
    }

    const quantity = Number(inventoryEntryQuantity);
    const unitCost = Number(inventoryEntryUnitCost);

    if (!inventoryEntryProductId) {
      setNotice("Selecciona un producto.");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setNotice("Ingresa una cantidad mayor que cero.");
      return;
    }

    if (
      inventoryEntryUnitCost.trim() === "" ||
      !Number.isFinite(unitCost) ||
      unitCost < 0
    ) {
      setNotice("Ingresa un costo por unidad válido. Puede ser cero si la unidad fue gratuita.");
      return;
    }

    setSavingForm(true);

    const { data, error } = await supabase.rpc("register_inventory_entry", {
      p_product_id: inventoryEntryProductId,
      p_quantity: quantity,
      p_note: inventoryEntryNote.trim() || null,
      p_unit_cost: unitCost,
      p_supplier: inventoryEntrySupplier.trim() || null
    });

    setSavingForm(false);

    if (error) {
      setNotice("No se pudo registrar la entrada: " + error.message);
      return;
    }

    setInventoryEntryOpen(false);
    setInventoryEntryProductId("");
    setInventoryEntryQuantity("1");
    setInventoryEntryUnitCost("");
    setInventoryEntrySupplier("");
    setInventoryEntryNote("");

    await refresh();
    setNotice(
      "Entrada registrada. Existencias: " + data.stock_qty +
      ". Costo promedio por unidad: C$" + Number(data.unit_cost).toFixed(4) +
      ". Total de compra: C$" + Number(data.purchase_total).toFixed(2)
    );
  }

function openCustomerForm(customer = null) {
    setEditingCustomer(customer);
    setCustomerForm(customer ? {
      full_name: customer.full_name,
      phone: customer.phone || "",
      email: customer.email || ""
    } : { full_name: "", phone: "", email: "" });
    setCustomerFormOpen(true);
  }

  async function loadCustomers() {
    const [customersResult, salesResult, paymentsResult] = await Promise.all([
      supabase.from("customers").select("id, full_name, phone, email, active, created_at").eq("active", true).order("full_name"),
      supabase.from("sales").select("id, customer_id, total").eq("status", "issued").not("customer_id", "is", null),
      supabase.from("payments").select("sale_id, amount")
    ]);
    const failed = [customersResult, salesResult, paymentsResult].find(result => result.error);
    if (failed) { setNotice(failed.error.message); return; }
    const paidBySale = new Map();
    for (const payment of paymentsResult.data ?? []) paidBySale.set(payment.sale_id, (paidBySale.get(payment.sale_id) || 0) + Number(payment.amount || 0));
    const balances = {};
    for (const sale of salesResult.data ?? []) balances[sale.customer_id] = (balances[sale.customer_id] || 0) + Math.max(0, Number(sale.total || 0) - (paidBySale.get(sale.id) || 0));
    setCustomerBalances(balances);
    setCustomers(customersResult.data ?? []);
  }

  async function saveCustomer(event) {
    event.preventDefault();
    if (!supabase || !session) return;
    setSavingForm(true);
    const payload = {
      full_name: customerForm.full_name.trim(),
      phone: customerForm.phone.trim() || null,
      email: customerForm.email.trim() || null
    };
    const result = editingCustomer
      ? await supabase.from("customers").update(payload).eq("id", editingCustomer.id)
      : await supabase.from("customers").insert({
          ...payload, created_by: session.user.id
        });
    setSavingForm(false);
    if (result.error) {
      setNotice("No se pudo guardar el cliente: " + result.error.message);
      return;
    }
    const wasEditing = Boolean(editingCustomer);
    setCustomerFormOpen(false);
    setEditingCustomer(null);
    await loadCustomers();
    setNotice(wasEditing ? "Cliente actualizado." : "Cliente agregado.");
  }

  const saleSubtotal = saleCart.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0
  );
  const saleTotal = Math.max(0, saleSubtotal - Number(saleDiscount || 0) + (saleDeliveryType === "none" ? 0 : Number(saleDeliveryCharge || 0)));

  function addSaleItem() {
    const product = products.find(p => p.id === selectedSaleProduct);
    const quantity = Number(saleQuantity);
    if (!product) {
      setNotice("Selecciona un producto para agregar.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setNotice("Ingresa una cantidad mayor que cero.");
      return;
    }
    const current = saleCart.find(item => item.product_id === product.id);
    const combinedQuantity = quantity + Number(current?.quantity || 0);
    if (combinedQuantity > Number(product.stock_qty)) {
      setNotice(`Existencias insuficientes de ${product.name}. Disponible: ${product.stock_qty}.`);
      return;
    }
    setSaleCart(previous => {
      const existing = previous.find(item => item.product_id === product.id);
      if (existing) {
        return previous.map(item => item.product_id === product.id
          ? { ...item, quantity: Number(item.quantity) + quantity }
          : item);
      }
      return [...previous, {
        product_id: product.id,
        name: product.name,
        quantity,
        unit_price: Number(product.sale_price),
        stock_qty: Number(product.stock_qty),
        sell_unit: product.sell_unit || "unidad"
      }];
    });
    setNotice("");
    setSaleQuantity("1");
  }

  async function saveSale(event) {
    event.preventDefault();
    if (!supabase || !session) {
      setNotice("No hay una sesión activa. Inicia sesión nuevamente.");
      return;
    }
    if (!saleCart.length) {
      setNotice("Agrega al menos un producto a la venta.");
      return;
    }
    const discount = Number(saleDiscount || 0);
    const payment = Number(salePaymentAmount || 0);
    const deliveryCharge = saleDeliveryType === "none" ? 0 : Number(saleDeliveryCharge || 0);
    const deliveryCost = saleDeliveryType === "none" ? 0 : Number(saleDeliveryCost || 0);
    const deliveryAddress = saleDeliveryType === "none" ? null : saleDeliveryAddress.trim();
    if (!Number.isFinite(discount) || discount < 0 || discount > saleSubtotal) {
      setNotice("El descuento debe estar entre cero y el subtotal.");
      return;
    }
    if (!["none", "colectivo", "privado"].includes(saleDeliveryType)) {
      setNotice("Selecciona un tipo de delivery válido.");
      return;
    }
    if (!Number.isFinite(deliveryCharge) || deliveryCharge < 0 ||
        !Number.isFinite(deliveryCost) || deliveryCost < 0) {
      setNotice("Los importes del delivery no pueden ser negativos.");
      return;
    }
    if (saleDeliveryType !== "none" && !deliveryAddress) {
      setNotice("Ingresa la dirección del cliente.");
      return;
    }
    if (!Number.isFinite(payment) || payment < 0 || payment > saleTotal) {
      setNotice("El pago debe estar entre cero y el total de la venta.");
      return;
    }

    setSavingForm(true);
    setNotice("");
    try {
      const { data, error } = await supabase.rpc("create_sale", {
        p_items: saleCart.map(item => ({
          product_id: item.product_id,
          quantity: Number(item.quantity),
          location_id: "home"
        })),
        p_customer_id: saleCustomerId || null,
        p_customer_name: saleCustomerName.trim() || "Cliente general",
        p_customer_phone: saleCustomerPhone.trim() || null,
        p_sales_channel: "direct",
        p_salesperson_id: session.user.id,
        p_discount: discount,
        p_delivery_type: saleDeliveryType,
        p_delivery_address: deliveryAddress,
        p_delivery_charge: deliveryCharge,
        p_delivery_cost: deliveryCost,
        p_payment_amount: payment,
        p_payment_method: salePaymentMethod,
        p_payment_reference: salePaymentReference.trim() || null,
        p_notes: saleNotes.trim() || null
      });
      if (error) throw error;
      if (data?.success === false) {
        throw new Error(data.message || "La base de datos no confirmó la venta.");
      }

      const invoice = data?.invoice ||
        `${data?.invoice_series || "ND"}-${String(data?.invoice_number || "").padStart(4, "0")}`;
      setSaleCart([]);
      setSelectedSaleProduct("");
      setSaleQuantity("1");
      setSaleCustomerId("");
      setSaleCustomerName("");
      setSaleCustomerPhone("");
      setSaleDiscount("0");
      setSalePaymentAmount("0");
      setSalePaymentMethod("cash");
      setSalePaymentReference("");
      setSaleNotes("");
      setSaleDeliveryType("none");
      setSaleDeliveryAddress("");
      setSaleDeliveryCharge("0");
      setSaleDeliveryCost("0");
      await refresh();
      setNotice(`Venta registrada correctamente: ${invoice}. Total: ${money(data?.total ?? saleTotal)}.`);
    } catch (error) {
      setNotice("No se pudo registrar la venta: " + (error?.message || "Error desconocido."));
    } finally {
      setSavingForm(false);
    }
  }

  function removeSaleItem(productId) {
    setSaleCart(previous => previous.filter(item => item.product_id !== productId));
  }

  async function refresh() {
    if (!supabase || !session) return;
    const { data, error } = await supabase.from("products")
      .select("id, sku, name, category, kind, sell_unit, stock_qty, low_stock_threshold, sale_price, active")
      .eq("active", true).order("name");
    if (error) setNotice(error.message);
    else { setProducts(data ?? []); setNotice("Inventario actualizado."); }
  }

  async function loadPurchaseHistory() {
    if (!supabase || profile?.role !== "admin") return;

    setPurchaseHistoryLoading(true);
    setPurchaseHistoryError("");

    try {
      const { data, error } = await supabase.rpc(
        "get_product_costs_and_purchases"
      );
      if (error) throw error;

      setCostProducts(data?.products ?? []);
      setPurchaseHistory(data?.history ?? []);
    } catch (error) {
      setPurchaseHistoryError(
        error?.message || "No se pudieron cargar los costos y las compras."
      );
    } finally {
      setPurchaseHistoryLoading(false);
    }
  }


  async function savePurchase(event) {
    event.preventDefault();

    if (!supabase || profile?.role !== "admin") {
      setNotice("Solo el administrador puede registrar compras.");
      return;
    }

    const quantity = Number(purchaseForm.quantity);
    const amount = Number(purchaseForm.amount_original);
    const rate = purchaseForm.currency === "NIO"
      ? 1
      : Number(purchaseForm.exchange_rate);

    if (!purchaseForm.product_id) {
      setNotice("Selecciona un producto.");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0 ||
        !Number.isFinite(amount) || amount <= 0 ||
        !Number.isFinite(rate) || rate <= 0) {
      setNotice("Revisa la cantidad, el monto y el tipo de cambio.");
      return;
    }

    if (purchaseForm.currency === "USD" && purchaseForm.bank_name === "Banpro") {
      setNotice("Banpro solo permite registrar compras en córdobas.");
      return;
    }

    const unitCostNio = (amount * rate) / quantity;
    setPurchaseSaving(true);

    try {
      const { data, error } = await supabase.rpc("register_inventory_entry", {
        p_product_id: purchaseForm.product_id,
        p_quantity: quantity,
        p_note: purchaseForm.note.trim() || null,
        p_unit_cost: unitCostNio,
        p_supplier: purchaseForm.supplier.trim() || null,
        p_currency: purchaseForm.currency,
        p_amount_original: amount,
        p_exchange_rate: rate,
        p_bank_name: purchaseForm.bank_name,
        p_payment_method: purchaseForm.payment_method
      });

      if (error) throw error;

      setPurchaseForm({
        product_id: "",
        quantity: "1",
        amount_original: "",
        currency: "USD",
        exchange_rate: "37.11",
        bank_name: "BAC",
        payment_method: "card",
        supplier: "",
        note: ""
      });

      await refresh();
      await loadPurchaseHistory();

      setNotice(
        "Compra registrada correctamente. Nuevo inventario: " +
        data.stock_qty + ". Costo promedio: C$" +
        Number(data.unit_cost).toFixed(4)
      );
    } catch (error) {
      setNotice("No se pudo registrar la compra: " + error.message);
    } finally {
      setPurchaseSaving(false);
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) setNotice(error.message);
  }

  useEffect(() => {
    if (section === "Finanzas" && profile?.role === "admin") {
      loadFinanceData();
    }
  }, [section, financeMonth, profile?.role]);

  useEffect(() => {
    if (!supabase || profile?.role !== "admin") return;
    supabase.rpc("get_usd_nio_rate").then(({ data, error }) => {
      if (error) setNotice(`No se pudo cargar la tasa de cambio: ${error.message}`);
      else if (Number(data) > 0) setUsdNioRate(String(data));
    });
  }, [profile?.role]);

  useEffect(() => {
    setPurchaseForm(current => current.currency === "USD" ? {...current, exchange_rate: usdNioRate} : current);
    setImportForm(current => ({...current, exchange_rate: usdNioRate}));
    setPaymentForm(current => current.currency === "USD" ? {...current, exchange_rate: usdNioRate} : current);
  }, [usdNioRate]);

  async function saveUsdNioRate() {
    const rate = Number(usdNioRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      setNotice("La tasa USD/NIO debe ser mayor que cero.");
      return;
    }
    setRateSaving(true);
    const { error } = await supabase.rpc("set_usd_nio_rate", {p_rate: rate});
    setRateSaving(false);
    setNotice(error ? `No se pudo guardar la tasa: ${error.message}` : "Tasa USD/NIO actualizada. Los registros anteriores conservan su tasa.");
  }

  if (!isSupabaseConfigured) return <main className="setup-wrap">
    <section className="setup-card">
      <div className="brand-mark"><Sprout size={30}/></div>
      <p className="eyebrow">CONFIGURACIÓN INICIAL</p>
      <h1>Conecta tu proyecto Supabase</h1>
      <p>La aplicación está lista para recibir las credenciales públicas del proyecto. Todavía no se conectará hasta que completes el archivo <code>.env.local</code>.</p>
      <ol>
        <li>Crea el proyecto en Supabase.</li>
        <li>Abre Project Settings → API (o Connect) y copia la Project URL y la publishable/anon key.</li>
        <li>Crea <code>.env.local</code> basándote en <code>.env.example</code>.</li>
        <li>Reinicia el servidor de desarrollo o vuelve a desplegar.</li>
      </ol>
      <div className="warning"><ShieldCheck size={18}/> Usa solo la clave publicable/anon en el navegador. Nunca copies una clave <code>service_role</code> aquí.</div>
    </section>
  </main>;

  if (loading && !session) return <div className="center-state">Cargando…</div>;
  if (!session) return <Login onNotice={setNotice}/>;

  async function loadFinanceData() {
    if (!supabase || profile?.role !== "admin") return;

    setFinanceLoading(true);
    setFinanceError("");

    const [year, month] = financeMonth.split("-").map(Number);
    const from = `${financeMonth}-01`;
    const nextMonth = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    try {
      const [expenseResult, salesResult, paymentResult, movementResult] =
        await Promise.all([
          supabase.from("expenses").select(
            "id, description, category, amount, amount_original, currency, exchange_rate, expense_date, payment_method, receipt_path, created_at"
          ).gte("expense_date", from).lt("expense_date", nextMonth)
            .order("expense_date", { ascending: false }),

          supabase.from("sales").select(
            "id, status, total, issued_at, created_at, delivery_charge, delivery_cost"
          ).eq("status", "issued")
            .gte("issued_at", from).lt("issued_at", nextMonth),

          supabase.from("payments").select(
            "id, sale_id, amount, paid_at, method"
          ).gte("paid_at", `${from}T00:00:00`)
            .lt("paid_at", `${nextMonth}T00:00:00`),

          supabase.from("inventory_movements").select(
            "id, related_sale_id, quantity_delta, unit_cost, created_at"
          ).eq("movement_kind", "sale")
            .gte("created_at", `${from}T00:00:00`)
            .lt("created_at", `${nextMonth}T00:00:00`)
        ]);

      for (const result of [expenseResult, salesResult, paymentResult, movementResult]) {
        if (result.error) throw result.error;
      }

      setFinanceExpenses(expenseResult.data || []);
      setFinanceSales(salesResult.data || []);
      setFinancePayments(paymentResult.data || []);
      setFinanceMovements(movementResult.data || []);
    } catch (error) {
      setFinanceError(error?.message || "No se pudieron cargar los datos financieros.");
    } finally {
      setFinanceLoading(false);
    }
  }

  async function saveFinanceExpense(event) {
    event.preventDefault();
    if (!supabase || profile?.role !== "admin") return;

    const amount = Number(expenseForm.amount);
    if (!expenseForm.description.trim() || !expenseForm.expense_date ||
        !Number.isFinite(amount) || amount <= 0) {
      setFinanceError("Completa la descripción, la fecha y un monto mayor que cero.");
      return;
    }

    setExpenseSaving(true);
    setFinanceError("");

    const payload = {
      description: expenseForm.description.trim(),
      category: expenseForm.category,
      currency: expenseForm.currency,
      amount_original: amount,
      exchange_rate: expenseForm.currency === "USD" ? Number(usdNioRate) : 1,
      amount: expenseForm.currency === "USD" ? amount * Number(usdNioRate) : amount,
      expense_date: expenseForm.expense_date,
      payment_method: expenseForm.payment_method,
      receipt_path: expenseForm.receipt_path.trim() || null,
      created_by: session?.user?.id
    };

    if (!payload.created_by) {
      setFinanceError("No se pudo identificar al usuario. Cierra sesión y vuelve a entrar.");
      setExpenseSaving(false);
      return;
    }

    try {
      const result = expenseEditing
        ? await supabase.from("expenses").update(payload).eq("id", expenseEditing.id)
        : await supabase.from("expenses").insert(payload);

      if (result.error) throw result.error;

      setExpenseForm({
        description: "",
        category: "Publicidad",
        amount: "",
        currency: "NIO",
        expense_date: new Date().toLocaleDateString("en-CA"),
        payment_method: "transfer",
        receipt_path: ""
      });
      setExpenseEditing(null);
      setNotice(expenseEditing ? "Gasto actualizado." : "Gasto registrado.");
      await loadFinanceData();
    } catch (error) {
      setFinanceError(error?.message || "No se pudo guardar el gasto.");
    } finally {
      setExpenseSaving(false);
    }
  }

  function editFinanceExpense(expense) {
    setExpenseEditing(expense);
    setExpenseForm({
      description: expense.description || "",
      category: expense.category || "Otros",
      amount: String(expense.amount_original ?? expense.amount ?? ""),
      currency: expense.currency || "NIO",
      expense_date: expense.expense_date || "",
      payment_method: expense.payment_method || "other",
      receipt_path: expense.receipt_path || ""
    });
    setFinanceError("");
  }

  async function deleteFinanceExpense(expense) {
    if (!supabase || profile?.role !== "admin") return;
    if (!window.confirm(`¿Eliminar el gasto "${expense.description}" por ${money(expense.amount)}?`)) return;

    setFinanceError("");
    const { error } = await supabase.from("expenses").delete().eq("id", expense.id);
    if (error) {
      setFinanceError(error.message || "No se pudo eliminar el gasto.");
      return;
    }
    setNotice("Gasto eliminado.");
    if (expenseEditing?.id === expense.id) setExpenseEditing(null);
    await loadFinanceData();
  }


  const isAdmin = profile?.role === "admin";
  const nav = [
    ["Inicio", LayoutDashboard],
    ["Inventario", Package],
    ["Clientes", Users],
    ["Ventas", ReceiptText],
    ...(isAdmin ? [["Importaciones", Package], ["Costos y compras", Package], ["Finanzas", Wallet]] : [])
  ];

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark small-mark"><Sprout size={22}/></div><div><strong>Nica Decants</strong><small>MANAGER</small></div></div>
      <nav>{nav.map(([name, Icon]) => <button key={name} className={section===name ? "nav-item selected" : "nav-item"} onClick={()=>{setSection(name); if(name==="Costos y compras") loadPurchaseHistory(); if(name==="Importaciones") loadImports(); if(name==="Clientes") loadCustomers();}}><Icon size={18}/>{name}</button>)}</nav>
      <div className="side-bottom"><ShieldCheck size={17}/><span>{isAdmin ? "Administrador" : "Empleado"}<small>Permisos según tu rol</small></span></div>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <div><p className="eyebrow">NICA DECANTS / OPERACIONES</p><h1>{section}</h1></div>
        <div className="user-area">
          {isAdmin && <label style={{display:"flex",alignItems:"center",gap:6}}>USD/NIO
            <input aria-label="Tasa USD/NIO" type="number" min="0.0001" step="0.0001" value={usdNioRate} onChange={e=>setUsdNioRate(e.target.value)} style={{width:100}} />
            <button className="secondary" type="button" disabled={rateSaving} onClick={saveUsdNioRate}>{rateSaving ? "Guardando…" : "Guardar tasa"}</button>
          </label>}
          <span className="user-name">{profile?.display_name || session.user.email}</span><button className="icon-button" title="Cerrar sesión" onClick={signOut}><LogOut size={18}/></button>
        </div>
      </header>
      {notice && <div className="notice" role="status">{notice}<button onClick={()=>setNotice("")}>Cerrar</button></div>}
      {loading && <p className="muted">Sincronizando con la base de datos…</p>}
      {section === "Inicio" && <section className="content">
        <div className="welcome"><div><p className="eyebrow light">PANEL DE CONTROL</p><h2>Bienvenido a tu negocio</h2><p>Consulta inventario y clientes desde un solo lugar.</p></div><Sprout size={52}/></div>
        <div className="metric-grid">
          <Metric icon={<Package/>} label="Productos activos" value={String(products.length)} />
          <Metric icon={<AlertTriangle/>} label="Alertas de inventario" value={String(products.filter(p=>Number(p.stock_qty)<=Number(p.low_stock_threshold)).length)} />
          <Metric icon={<Users/>} label="Clientes activos" value={String(customers.length)} />
          {isAdmin && <Metric icon={<ShieldCheck/>} label="Rol de acceso" value="Administrador"/>}
        </div>
        <div className="panel"><div className="panel-heading"><div><h3>Existencias bajas</h3><p className="muted">Productos que alcanzaron el umbral configurado.</p></div><button className="secondary" onClick={()=>setSection("Inventario")}>Ver inventario</button></div>
          <ProductTable products={products.filter(p=>Number(p.stock_qty)<=Number(p.low_stock_threshold)).slice(0,6)} empty="No hay alertas de stock bajo."/>
        </div>
      </section>}
      {section === "Inventario" && <section className="content">
        <div className="panel"><div className="panel-heading"><div><h3>Productos</h3><p className="muted">Los costos no se consultan ni se muestran en esta pantalla.</p></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="secondary" onClick={refresh}>Actualizar</button>{isAdmin && <><button className="secondary" onClick={() => setInventoryEntryOpen(!inventoryEntryOpen)}>Entrada de inventario</button><button className="secondary" onClick={() => setInventoryAdjustmentOpen(!inventoryAdjustmentOpen)}>Ajustar inventario</button><button onClick={() => openProductForm()}>Agregar producto</button></>}</div></div>
          {productFormOpen && isAdmin && <form onSubmit={saveProduct} style={{display:"grid",gap:12,padding:"16px 0"}}>
            <h3>{editingProduct ? "Editar producto" : "Nuevo producto"}</h3>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
              <label>Nombre *<input required value={productForm.name} onChange={e=>setProductForm({...productForm,name:e.target.value})}/></label>
              <label>SKU<input value={productForm.sku} onChange={e=>setProductForm({...productForm,sku:e.target.value})}/></label>
              <label>Categoría<input value={productForm.category} onChange={e=>setProductForm({...productForm,category:e.target.value})}/></label>
              <label>Tipo<select value={productForm.kind} onChange={e=>setProductForm({...productForm,kind:e.target.value})}><option value="finished">Producto terminado</option><option value="supply">Suministro</option><option value="source_perfume">Perfume original</option></select></label>
              <label>Unidad de venta<input required value={productForm.sell_unit} onChange={e=>setProductForm({...productForm,sell_unit:e.target.value})}/></label>
              <label>Stock mínimo<input type="number" min="0" step="0.001" required value={productForm.low_stock_threshold} onChange={e=>setProductForm({...productForm,low_stock_threshold:e.target.value})}/></label>
              <label>Precio de venta<input type="number" min="0" step="0.01" required value={productForm.sale_price} onChange={e=>setProductForm({...productForm,sale_price:e.target.value})}/></label>
            </div>
            <p className="muted">Las existencias se mantendrán en cero hasta habilitar los movimientos de inventario.</p>
            <div style={{display:"flex",gap:8}}><button type="submit" disabled={savingForm}>{savingForm ? "Guardando..." : "Guardar producto"}</button><button type="button" className="secondary" onClick={()=>setProductFormOpen(false)}>Cancelar</button></div>
          </form>}
          
          {inventoryEntryOpen && isAdmin && <form onSubmit={saveInventoryEntry} style={{display:"grid",gap:12,padding:"16px 0",borderBottom:"1px solid var(--border, #ddd)"}}>
            <h3>Registrar entrada de inventario</h3>
            <p className="muted">La cantidad se sumará a las existencias actuales. Registra el costo real de esta compra; el sistema actualizará el costo promedio.</p>
            <label>Producto *
              <select required value={inventoryEntryProductId} onChange={e=>setInventoryEntryProductId(e.target.value)}>
                <option value="">Seleccionar producto...</option>
                {products.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name} — Existencias actuales: {p.stock_qty} {p.sell_unit}</option>)}
              </select>
            </label>
            <label>Cantidad que ingresa *
              <input type="number" min="0.001" step="any" required value={inventoryEntryQuantity} onChange={e=>setInventoryEntryQuantity(e.target.value)} />
            </label>
            <label>Costo de compra por unidad (C$) *
              <input type="number" min="0" step="0.0001" required value={inventoryEntryUnitCost} onChange={e=>setInventoryEntryUnitCost(e.target.value)} placeholder="Ej.: 12.50" />
            </label>
            <p className="muted">Total de esta compra: C${(Math.max(0, Number(inventoryEntryQuantity) || 0) * Math.max(0, Number(inventoryEntryUnitCost) || 0)).toLocaleString("es-NI", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
            <label>Proveedor (opcional)
              <input value={inventoryEntrySupplier} onChange={e=>setInventoryEntrySupplier(e.target.value)} placeholder="Nombre del proveedor o tienda" />
            </label>
            <label>Nota o referencia (opcional)
              <input value={inventoryEntryNote} onChange={e=>setInventoryEntryNote(e.target.value)} placeholder="Ej.: Número de factura, envío, referencia..." />
            </label>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button type="submit" disabled={savingForm}>{savingForm ? "Registrando..." : "Registrar entrada"}</button>
              <button type="button" className="secondary" onClick={()=>setInventoryEntryOpen(false)}>Cancelar</button>
            </div>
          </form>}

          {inventoryAdjustmentOpen && isAdmin && <form onSubmit={saveInventoryAdjustment} style={{display:"grid",gap:12,padding:"16px 0",borderBottom:"1px solid var(--border, #ddd)"}}>
            <h3>Ajustar inventario</h3>
            <p className="muted">Introduce la cantidad total que tienes realmente. Este valor reemplazará las existencias actuales y quedará registrado en el historial.</p>
            <label>Producto *
              <select required value={adjustmentProductId} onChange={e=>{
                const id = e.target.value;
                setAdjustmentProductId(id);
                const product = products.find(p=>p.id===id);
                setAdjustmentQuantity(product ? String(product.stock_qty) : "");
              }}>
                <option value="">Seleccionar producto...</option>
                {products.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name} — Existencias actuales: {p.stock_qty} {p.sell_unit}</option>)}
              </select>
            </label>
            <label>Cantidad real disponible *
              <input type="number" min="0" step="any" required value={adjustmentQuantity} onChange={e=>setAdjustmentQuantity(e.target.value)} />
            </label>
            <label>Motivo del ajuste
              <input value={adjustmentNote} onChange={e=>setAdjustmentNote(e.target.value)} placeholder="Ej.: Conteo físico o corrección de registro" />
            </label>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button type="submit" disabled={savingForm}>{savingForm ? "Guardando..." : "Confirmar ajuste"}</button>
              <button type="button" className="secondary" onClick={()=>setInventoryAdjustmentOpen(false)}>Cancelar</button>
            </div>
          </form>}
<div className="search-box"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar nombre, SKU o categoría"/></div>
          <ProductTable products={filteredProducts} empty="No hay productos para mostrar." onEdit={isAdmin ? openProductForm : null}/>
        </div>
        <div className="hint"><LockKeyhole size={17}/><span>El alta y modificación de productos se habilitarán mediante funciones de administrador. No se permite editar el inventario directamente desde el navegador.</span></div>
      </section>}
      {section === "Clientes" && <section className="content"><div className="panel"><div className="panel-heading"><div><h3>Clientes</h3><p className="muted">Información de contacto cargada desde Supabase.</p></div><div style={{display:"flex",gap:8,alignItems:"center"}}><span className="pill">{customers.length} clientes</span><button onClick={() => openCustomerForm()}>Agregar cliente</button></div></div>
        {customerFormOpen && <form onSubmit={saveCustomer} style={{display:"grid",gap:12,padding:"16px 0"}}>
          <h3>{editingCustomer ? "Editar cliente" : "Nuevo cliente"}</h3>
          <label>Nombre completo *<input required value={customerForm.full_name} onChange={e=>setCustomerForm({...customerForm,full_name:e.target.value})}/></label>
          <label>Teléfono<input value={customerForm.phone} onChange={e=>setCustomerForm({...customerForm,phone:e.target.value})}/></label>
          <label>Correo electrónico<input type="email" value={customerForm.email} onChange={e=>setCustomerForm({...customerForm,email:e.target.value})}/></label>
          <div style={{display:"flex",gap:8}}><button type="submit" disabled={savingForm}>{savingForm ? "Guardando..." : "Guardar cliente"}</button><button type="button" className="secondary" onClick={()=>setCustomerFormOpen(false)}>Cancelar</button></div>
        </form>}
        {customers.length ? <div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Correo</th><th>Saldo pendiente</th><th>Acciones</th></tr></thead><tbody>{customers.map(c=><tr key={c.id}><td>{c.full_name}</td><td>{c.phone || "—"}</td><td>{c.email || "—"}</td><td>{money(customerBalances[c.id] || 0)}</td><td><button className="secondary" onClick={()=>openCustomerForm(c)}>Editar</button></td></tr>)}</tbody></table></div> : <Empty text="Todavía no hay clientes. Puedes agregar el primero con el botón de arriba."/>}
      </div></section>}
      {section === "Ventas" && <section className="content">
        <div className="panel">
          <div className="panel-heading">
            <div><h3>Nueva venta</h3><p className="muted">El inventario se actualizará al confirmar la venta.</p></div>
            <span className="pill">{saleCart.length} productos</span>
          </div>
          <form onSubmit={saveSale} style={{display:"grid",gap:16}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
              <label>Producto
                <select value={selectedSaleProduct} onChange={e=>setSelectedSaleProduct(e.target.value)} required>
                  <option value="">Seleccionar producto...</option>
                  {products.filter(p=>p.active && Number(p.stock_qty)>0).map(p=><option key={p.id} value={p.id}>{p.name} — Stock: {p.stock_qty} {p.sell_unit} — {money(p.sale_price)}</option>)}
                </select>
              </label>
              <label>Cantidad
                <input type="number" min="0.001" step="0.001" value={saleQuantity} onChange={e=>setSaleQuantity(e.target.value)} required/>
              </label>
              <div style={{display:"flex",alignItems:"end"}}>
                <button type="button" onClick={addSaleItem}>Agregar al carrito</button>
              </div>
            </div>

            {saleCart.length ? <div className="table-wrap"><table>
              <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Importe</th><th>Acción</th></tr></thead>
              <tbody>{saleCart.map(item=><tr key={item.product_id}>
                <td>{item.name}</td>
                <td>{item.quantity} {item.sell_unit}</td>
                <td>{money(item.unit_price)}</td>
                <td>{money(Number(item.quantity)*Number(item.unit_price))}</td>
                <td><button type="button" className="secondary" onClick={()=>removeSaleItem(item.product_id)}>Quitar</button></td>
              </tr>)}</tbody>
            </table></div> : <p className="muted">El carrito está vacío. Agrega un producto para comenzar.</p>}

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
              <label>Cliente
                <select value={saleCustomerId} onChange={e=>setSaleCustomerId(e.target.value)}>
                  <option value="">Cliente general</option>
                  {customers.map(c=><option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
              </label>
              {!saleCustomerId && <>
                <label>Nombre del cliente (opcional)
                  <input value={saleCustomerName} onChange={e=>setSaleCustomerName(e.target.value)} placeholder="Cliente general"/>
                </label>
                <label>Teléfono (opcional)
                  <input value={saleCustomerPhone} onChange={e=>setSaleCustomerPhone(e.target.value)}/>
                </label>
              </>}
              <label>Descuento (C$)
                <input type="number" min="0" max={saleSubtotal} step="0.01" value={saleDiscount} onChange={e=>setSaleDiscount(e.target.value)} required/>
              </label>
              <label>Pago recibido (C$)
                <input type="number" min="0" max={saleTotal} step="0.01" value={salePaymentAmount} onChange={e=>setSalePaymentAmount(e.target.value)} required/>
              </label>
              <label>Método de pago
                <select value={salePaymentMethod} onChange={e=>setSalePaymentMethod(e.target.value)}>
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                  <option value="card">Tarjeta</option>
                  <option value="other">Otro</option>
                </select>
              </label>
              <label>Referencia del pago (opcional)
                <input value={salePaymentReference} onChange={e=>setSalePaymentReference(e.target.value)}/>
              </label>
            </div>
            <div className="panel" style={{display:"grid",gap:12}}>
              <h3>Delivery</h3>
              <label>Tipo de delivery
                <select value={saleDeliveryType} onChange={e=>setSaleDeliveryType(e.target.value)}>
                  <option value="none">Sin delivery / retiro</option>
                  <option value="colectivo">Delivery del colectivo</option>
                  <option value="privado">Delivery privado</option>
                </select>
              </label>
              {saleDeliveryType !== "none" && <>
                <label>Dirección del cliente *
                  <textarea value={saleDeliveryAddress} onChange={e=>setSaleDeliveryAddress(e.target.value)} rows="2" required placeholder="Dirección exacta de entrega"/>
                </label>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
                  <label>Delivery cobrado al cliente (C$)
                    <input type="number" min="0" step="0.01" value={saleDeliveryCharge} onChange={e=>setSaleDeliveryCharge(e.target.value)} required/>
                  </label>
                  <label>Costo real del delivery (C$)
                    <input type="number" min="0" step="0.01" value={saleDeliveryCost} onChange={e=>setSaleDeliveryCost(e.target.value)} required/>
                  </label>
                </div>
                <p className="muted">Diferencia del delivery: {money(Number(saleDeliveryCharge || 0)-Number(saleDeliveryCost || 0))}</p>
              </>}
            </div>

            <label>Notas (opcional)
              <textarea value={saleNotes} onChange={e=>setSaleNotes(e.target.value)} rows="2"/>
            </label>

            <div style={{marginLeft:"auto",minWidth:240,display:"grid",gap:8,textAlign:"right"}}>
              <div>Subtotal: <strong>{money(saleSubtotal)}</strong></div>
              <div>Descuento: <strong>{money(saleDiscount)}</strong></div>
              {saleDeliveryType !== "none" && <div>Delivery: <strong>{money(saleDeliveryCharge)}</strong></div>}
              <div style={{fontSize:20}}>Total: <strong>{money(saleTotal)}</strong></div>
              <div className="muted">Saldo pendiente: {money(Math.max(0,saleTotal-Number(salePaymentAmount||0)))}</div>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button type="submit" disabled={savingForm || !saleCart.length}>{savingForm ? "Registrando..." : "Confirmar venta"}</button>
              <button type="button" className="secondary" disabled={savingForm} onClick={()=>{setSaleCart([]);setSaleDiscount("0");setSalePaymentAmount("0");setNotice("Carrito vaciado.");}}>Vaciar carrito</button>
            </div>
          </form>
        </div>
      </section>}
      {section === "Costos y compras" && isAdmin && <section className="content">
  <div className="panel" style={{ marginBottom: 16 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div>
        <h2>Costos y compras</h2>
        <p>Consulta los costos registrados y el historial de compras de tus productos.</p>
      </div>
      <button type="button" onClick={loadPurchaseHistory} disabled={purchaseHistoryLoading}>
        {purchaseHistoryLoading ? "Cargando..." : "Actualizar datos"}
      </button>
    </div>
    {purchaseHistoryError && <p role="alert" style={{ color: "#b91c1c" }}>{purchaseHistoryError}</p>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 18 }}>
      <div className="panel">
        <p>Valor con costo conocido</p>
        <h3>{money(costProducts.reduce((sum, p) => {
          const hasCost = p.unit_cost !== null && p.unit_cost !== undefined && Number(p.unit_cost) > 0;
          return sum + (hasCost ? Number(p.stock_qty || 0) * Number(p.unit_cost) : 0);
        }, 0))}</h3>
      </div>
      <div className="panel">
        <p>Productos con costo</p>
        <h3>{costProducts.filter(p => p.unit_cost !== null && p.unit_cost !== undefined && Number(p.unit_cost) > 0).length}</h3>
      </div>
      <div className="panel">
        <p>Productos sin costo</p>
        <h3>{costProducts.filter(p => p.unit_cost === null || p.unit_cost === undefined || Number(p.unit_cost) <= 0).length}</h3>
      </div>
      <div className="panel">
        <p>Compras registradas</p>
        <h3>{purchaseHistory.length}</h3>
      </div>
    </div>
  </div>

  <div className="panel" style={{ marginBottom: 16 }}>

    <h3>Registrar nueva compra</h3>
    <p className="muted">Registra el pago al proveedor. El inventario y el costo promedio se actualizarán automáticamente.</p>

    <form className="form-grid" onSubmit={savePurchase}>
      <label>
        Producto
        <select
          required
          value={purchaseForm.product_id}
          onChange={e => setPurchaseForm(f => ({...f, product_id: e.target.value}))}
        >
          <option value="">Selecciona un producto</option>
          {products.filter(p => p.active).map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>

      <label>
        Cantidad comprada
        <input
          type="number"
          min="0.001"
          step="0.001"
          required
          value={purchaseForm.quantity}
          onChange={e => setPurchaseForm(f => ({...f, quantity: e.target.value}))}
        />
      </label>

      <label>
        Moneda del pago
        <select
          value={purchaseForm.currency}
          onChange={e => setPurchaseForm(f => ({
            ...f,
            currency: e.target.value,
            bank_name: e.target.value === "USD" && f.bank_name === "Banpro" ? "BAC" : f.bank_name
          }))}
        >
          <option value="NIO">Córdobas (C$)</option>
          <option value="USD">Dólares (US$)</option>
        </select>
      </label>

      <label>
        Monto total pagado ({purchaseForm.currency === "USD" ? "US$" : "C$"})
        <input
          type="number"
          min="0.01"
          step="0.01"
          required
          value={purchaseForm.amount_original}
          onChange={e => setPurchaseForm(f => ({...f, amount_original: e.target.value}))}
        />
      </label>

      {purchaseForm.currency === "USD" && (
        <label>
          Tipo de cambio utilizado
          <input
            type="number"
            min="0.01"
            step="0.0001"
            required
            value={purchaseForm.exchange_rate}
            onChange={e => setPurchaseForm(f => ({...f, exchange_rate: e.target.value}))}
          />
        </label>
      )}

      <label>
        Banco
        <select
          value={purchaseForm.bank_name}
          onChange={e => setPurchaseForm(f => ({...f, bank_name: e.target.value}))}
        >
          <option value="BAC">BAC</option>
          <option value="Lafise">Lafise</option>
          {purchaseForm.currency === "NIO" && <option value="Banpro">Banpro</option>}
        </select>
      </label>

      <label>
        Método de pago
        <select
          value={purchaseForm.payment_method}
          onChange={e => setPurchaseForm(f => ({...f, payment_method: e.target.value}))}
        >
          <option value="card">Tarjeta</option>
          <option value="transfer">Transferencia</option>
          <option value="cash">Efectivo</option>
          <option value="other">Otro</option>
        </select>
      </label>

      <label>
        Proveedor o tienda
        <input
          value={purchaseForm.supplier}
          onChange={e => setPurchaseForm(f => ({...f, supplier: e.target.value}))}
          placeholder="Amazon, eBay, tienda local..."
        />
      </label>

      <label>
        Notas
        <input
          value={purchaseForm.note}
          onChange={e => setPurchaseForm(f => ({...f, note: e.target.value}))}
          placeholder="Detalles de la compra"
        />
      </label>

      <div className="panel">
        <p>Costo unitario calculado en córdobas</p>
        <h3>
          {money(
            Number(purchaseForm.quantity) > 0
              ? (Number(purchaseForm.amount_original || 0) *
                (purchaseForm.currency === "USD" ? Number(purchaseForm.exchange_rate || 0) : 1)) /
                Number(purchaseForm.quantity)
              : 0
          )}
        </h3>
        <p className="muted">Este costo se utilizará para calcular el costo promedio del producto.</p>
      </div>

      <button type="submit" disabled={purchaseSaving}>
        {purchaseSaving ? "Registrando compra..." : "Registrar compra y actualizar inventario"}
      </button>
    </form>

    <hr style={{margin: "24px 0"}} />
    <h3>Costos por producto</h3>
    {purchaseHistoryLoading && costProducts.length === 0 ? <p>Cargando productos...</p> :
    costProducts.length === 0 ? <p>No hay datos cargados. Pulsa “Actualizar datos”.</p> :
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>
          <th style={{ textAlign: "left", padding: 10 }}>Producto</th>
          <th style={{ textAlign: "right", padding: 10 }}>Existencias</th>
          <th style={{ textAlign: "right", padding: 10 }}>Costo promedio</th>
          <th style={{ textAlign: "right", padding: 10 }}>Última compra</th>
          <th style={{ textAlign: "left", padding: 10 }}>Proveedor</th>
          <th style={{ textAlign: "right", padding: 10 }}>Valor inventario</th>
        </tr></thead>
        <tbody>
          {costProducts.map(p => {
            const hasCost = p.unit_cost !== null && p.unit_cost !== undefined && Number(p.unit_cost) > 0;
            return <tr key={p.id}>
              <td style={{ padding: 10 }}>{p.name}</td>
              <td style={{ textAlign: "right", padding: 10 }}>{Number(p.stock_qty || 0)}</td>
              <td style={{ textAlign: "right", padding: 10 }}>{hasCost ? money(p.unit_cost) : "Costo no registrado"}</td>
              <td style={{ textAlign: "right", padding: 10 }}>{p.last_purchase_cost != null ? money(p.last_purchase_cost) : "—"}</td>
              <td style={{ padding: 10 }}>{p.last_supplier || "—"}</td>
              <td style={{ textAlign: "right", padding: 10 }}>{hasCost ? money(Number(p.stock_qty || 0) * Number(p.unit_cost)) : "—"}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>}
  </div>

  <div className="panel">
    <h3>Historial de compras</h3>
    {purchaseHistory.length === 0 ? <p>No hay compras registradas todavía, o no se han cargado los datos.</p> :
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>
          <th style={{textAlign:"left",padding:10}}>Fecha</th>
          <th style={{textAlign:"left",padding:10}}>Producto</th>
          <th style={{textAlign:"right",padding:10}}>Cantidad</th>
          <th style={{textAlign:"right",padding:10}}>Monto pagado</th>
          <th style={{textAlign:"right",padding:10}}>Tipo de cambio</th>
          <th style={{textAlign:"left",padding:10}}>Banco</th>
          <th style={{textAlign:"left",padding:10}}>Método</th>
          <th style={{textAlign:"right",padding:10}}>Costo unitario (C$)</th>
          <th style={{textAlign:"right",padding:10}}>Total (C$)</th>
          <th style={{textAlign:"left",padding:10}}>Proveedor</th>
          <th style={{textAlign:"left",padding:10}}>Nota</th>
        </tr></thead>
        <tbody>
          {purchaseHistory.map(h => <tr key={h.id}>
            <td style={{padding:10}}>{h.created_at ? new Date(h.created_at).toLocaleDateString("es-NI") : "—"}</td>
            <td style={{padding:10}}>{h.product_name || "Producto"}</td>
            <td style={{textAlign:"right",padding:10}}>{Number(h.quantity || 0)}</td>
            <td style={{textAlign:"right",padding:10}}>{h.currency === "USD" ? "US$" : "C$"}{Number(h.amount_original ?? h.total_cost ?? 0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
            <td style={{textAlign:"right",padding:10}}>{h.currency === "USD" ? Number(h.exchange_rate || 0).toFixed(4) : "—"}</td>
            <td style={{padding:10}}>{h.bank_name || "—"}</td>
            <td style={{padding:10}}>{{card:"Tarjeta",transfer:"Transferencia",cash:"Efectivo",other:"Otro"}[h.payment_method] || "—"}</td>
            <td style={{textAlign:"right",padding:10}}>{money(h.unit_cost)}</td>
            <td style={{textAlign:"right",padding:10}}>{money(h.total_cost)}</td>
            <td style={{padding:10}}>{h.supplier || "—"}</td>
            <td style={{padding:10}}>{h.note || "—"}</td>
          </tr>)}
        </tbody>
      </table>
    </div>}
  </div>
</section>}

{section === "Importaciones" && isAdmin && <section className="content">
  <style>{`
    .import-form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 22px;
      align-items: start;
      padding-top: 14px;
    }
    .import-form-grid > label {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
      line-height: 1.45;
    }
    .import-form-grid input, .import-form-grid select,
    .import-form-grid textarea {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
    }
    .import-subheading {
      grid-column: 1 / -1;
      margin: 8px 0 -6px;
      padding-bottom: 10px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 14px;
      font-weight: 700;
    }
    .import-total-card {
      grid-column: 1 / -1;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 18px 20px;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      background: #f8fafc;
    }
    .import-total-card strong { font-size: 1.25rem; }
    @media (max-width: 600px) {
      .import-form-grid { grid-template-columns: minmax(0, 1fr); gap: 16px; }
    }
  `}</style>
  <div className="panel">
    <div className="panel-heading">
      <div><h3>Nueva importación</h3><p className="muted">Registra compras enviadas desde Estados Unidos, China u otro país.</p></div>
      <span className="pill">{imports.length} registros</span>
    </div>
    <form className="form-grid import-form-grid" onSubmit={saveImport}>
      <div className="import-subheading">Datos de la compra</div>
      <label>Proveedor
        <input value={importForm.supplier} onChange={e=>setImportForm({...importForm,supplier:e.target.value})} required placeholder="Nombre del proveedor"/>
      </label>
      <label>País de origen
        <select value={importForm.origin_country} onChange={e=>setImportForm({...importForm,origin_country:e.target.value})}>
          <option>Estados Unidos</option><option>China</option><option>Nicaragua</option><option>Otro</option>
        </select>
      </label>
      <label>Agencia de envío
        <input value={importForm.shipping_agency} onChange={e=>setImportForm({...importForm,shipping_agency:e.target.value})} required placeholder="Nombre de la agencia"/>
      </label>
      <label>Transporte
        <select
          value={importForm.transport_mode}
          onChange={e => {
            const mode = e.target.value;
            setImportForm({
              ...importForm,
              transport_mode: mode,
              package_rate_per_lb: mode === "air" ? "7" : "2.60"
            });
          }}
        >
          <option value="air">Aéreo — US$7.00/lb</option>
          <option value="sea">Marítimo — US$2.60/lb</option>
          <option value="ground">Terrestre — US$7.00/lb</option>
        </select>
      </label>
      <label>Referencia / pedido
        <input value={importForm.reference} onChange={e=>setImportForm({...importForm,reference:e.target.value})} placeholder="Tracking o número de pedido"/>
      </label>
      <label>Estado
        <select value={importForm.status} onChange={e=>setImportForm({...importForm,status:e.target.value})}>
          <option value="pending">Pendiente</option><option value="in_transit">En tránsito</option><option value="received">Recibida</option><option value="cancelled">Cancelada</option>
        </select>
      </label>
      <label>Fecha de pedido
        <input type="date" value={importForm.ordered_at} onChange={e=>setImportForm({...importForm,ordered_at:e.target.value})} required/>
      </label>
      <label>Fecha estimada de llegada
        <input type="date" value={importForm.estimated_arrival} onChange={e=>setImportForm({...importForm,estimated_arrival:e.target.value})}/>
      </label>
      <label>Total de compra (C$)
        <input type="number" min="0" step="0.01" value={importForm.purchase_total} onChange={e=>setImportForm({...importForm,purchase_total:e.target.value})} required/>
      </label>
      <div className="import-subheading">Datos del envío</div>
      <label>Peso del paquete (lb)
        <input type="number" min="0" step="0.001" value={importForm.package_weight_lb} onChange={e=>setImportForm({...importForm,package_weight_lb:e.target.value})} placeholder="Ej. 5.5"/>
      </label>
      <label>Tasa de cambio (C$ por US$1)
        <input
          type="number"
          min="0.0001"
          step="0.0001"
          value={importForm.exchange_rate}
          onChange={e => setImportForm({...importForm, exchange_rate:e.target.value})}
          required
        />
      </label>
      <label>Tarifa por libra (USD)
        <input type="number" value={importForm.package_rate_per_lb} readOnly />
      </label>
      <div className="import-total-card">
        <div>
          <span className="muted">Costo estimado del envío</span>
          <br />
          <strong>
            US${(
              (Number(importForm.package_weight_lb) || 0) *
              (Number(importForm.package_rate_per_lb) || 0)
            ).toFixed(2)}
          </strong>
          <br />
          <strong>
            {money(
              (Number(importForm.package_weight_lb) || 0) *
              (Number(importForm.package_rate_per_lb) || 0) *
              (Number(importForm.exchange_rate) || 0)
            )}
          </strong>
        </div>
        <span className="muted">Costo en dólares y córdobas</span>
      </div>
      <div className="import-subheading">Productos de la importación</div>
      {importItems.map((item, index) => <div key={index} className="form-grid" style={{gridColumn:"1 / -1",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))"}}>
        <label>Producto
          <select value={item.product_id} onChange={e=>setImportItems(items=>items.map((row,i)=>i===index?{...row,product_id:e.target.value}:row))}>
            <option value="">Selecciona un producto</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>Cantidad<input type="number" min="0.001" step="0.001" value={item.quantity} onChange={e=>setImportItems(items=>items.map((row,i)=>i===index?{...row,quantity:e.target.value}:row))}/></label>
        <label>Moneda<select value={item.currency} onChange={e=>setImportItems(items=>items.map((row,i)=>i===index?{...row,currency:e.target.value}:row))}><option value="USD">USD</option><option value="NIO">NIO</option></select></label>
        <label>Importe del producto<input type="number" min="0" step="0.01" value={item.amount_original} onChange={e=>setImportItems(items=>items.map((row,i)=>i===index?{...row,amount_original:e.target.value}:row))}/></label>
        {importItems.length > 1 && <button type="button" className="secondary" onClick={()=>setImportItems(items=>items.filter((_,i)=>i!==index))}>Quitar línea</button>}
      </div>)}
      <button type="button" className="secondary" style={{gridColumn:"1 / -1",justifySelf:"start"}} onClick={()=>setImportItems(items=>[...items,{product_id:"",quantity:"1",amount_original:"",currency:"USD"}])}>Agregar producto</button>
      <label style={{gridColumn:"1 / -1"}}>Notas
        <textarea value={importForm.notes} onChange={e=>setImportForm({...importForm,notes:e.target.value})} rows="2" placeholder="Detalles del pedido o envío"/>
      </label>
      <div style={{gridColumn:"1 / -1"}}><button className="primary" disabled={savingForm}>{savingForm ? "Guardando…" : "Guardar importación"}</button></div>
    </form>
  </div>
  <div className="panel">
    <div className="panel-heading"><div><h3>Historial de importaciones</h3><p className="muted">Registros guardados en Supabase.</p></div><button className="secondary" onClick={loadImports} disabled={importsLoading}>{importsLoading ? "Cargando…" : "Actualizar"}</button></div>
    {importsLoading ? <p className="muted">Cargando importaciones…</p> : !imports.length ? <Empty text="Todavía no hay importaciones registradas."/> :
      <div className="table-wrap"><table><thead><tr><th>Proveedor / referencia</th><th>Origen</th><th>Agencia</th><th>Transporte</th><th>Fecha</th><th>Estado</th><th style={{textAlign:"right"}}>Compra</th><th style={{textAlign:"right"}}>Envío</th></tr></thead><tbody>
      {imports.map(item=><tr key={item.id}>
        <td><strong>{item.supplier}</strong><small>{item.reference || "Sin referencia"}</small></td>
        <td>{item.origin_country}</td><td>{item.shipping_agency}</td>
        <td>{({air:"Aéreo",sea:"Marítimo",ground:"Terrestre"})[item.transport_mode] || item.transport_mode}</td>
        <td>{item.ordered_at ? new Date(item.ordered_at + "T12:00:00").toLocaleDateString("es-NI") : "—"}</td>
        <td>{({pending:"Pendiente",in_transit:"En tránsito",received:"Recibida",cancelled:"Cancelada"})[item.status] || item.status}</td>
        <td style={{textAlign:"right"}}>{money(item.purchase_total)}</td>
        <td style={{textAlign:"right"}}>{money((item.import_packages ?? []).reduce((sum, pack) => sum + Number(pack.shipping_cost || 0), 0))}
          {item.status !== "received" && (item.import_shipment_items ?? []).length > 0 && <button className="secondary" type="button" disabled={savingForm} onClick={()=>receiveImport(item)}>{savingForm ? "Procesando…" : "Recibir productos"}</button>}
        </td>
      </tr>)}
      </tbody></table></div>
    }
  </div>
</section>}


{section === "Importaciones" && isAdmin && <section className="content">
  <div className="panel">
    <div className="panel-heading">
      <div><h3>Agregar paquete</h3><p className="muted">Registra tantos paquetes como pertenezcan a una misma importación.</p></div>
    </div>
    {!imports.length ? <p className="muted">Primero registra una importación.</p> : <>
      <form className="form-grid import-form-grid" onSubmit={saveExtraPackage}>
        <label>Importación
          <select required value={packageForm.shipment_id} onChange={e=>setPackageForm({...packageForm,shipment_id:e.target.value})}>
            <option value="">Selecciona una importación</option>
            {imports.map(i=><option key={i.id} value={i.id}>{i.supplier} — {i.reference || i.ordered_at}</option>)}
          </select>
        </label>
        <label>Tracking
          <input value={packageForm.tracking_reference} onChange={e=>setPackageForm({...packageForm,tracking_reference:e.target.value})} placeholder="Número de tracking"/>
        </label>
        <label>Peso (lb)
          <input type="number" min="0.001" step="0.001" required value={packageForm.weight_lb} onChange={e=>setPackageForm({...packageForm,weight_lb:e.target.value})}/>
        </label>
        <label>Tarifa por libra (USD)
          <input
            type="text"
            readOnly
            value={
              packageForm.shipment_id
                ? `US$${imports.find(i => i.id === packageForm.shipment_id)?.transport_mode === "sea" ? "2.60" : "7.00"}`
                : "Selecciona una importación"
            }
          />
        </label>
        <label>Estado
          <select value={packageForm.status} onChange={e=>setPackageForm({...packageForm,status:e.target.value})}>
            <option value="pending">Pendiente</option><option value="in_transit">En tránsito</option><option value="received">Recibido</option>
          </select>
        </label>
        <label>Notas
          <input value={packageForm.notes} onChange={e=>setPackageForm({...packageForm,notes:e.target.value})}/>
        </label>
        <div className="import-total-card">
          <div>
            <span className="muted">Costo estimado del paquete</span>
            <br />
            <strong>
              US${(
                (Number(packageForm.weight_lb) || 0) *
                (packageForm.shipment_id && imports.find(i => i.id === packageForm.shipment_id)?.transport_mode === "sea" ? 2.60 : 7.00)
              ).toFixed(2)}
            </strong>
            <br />
            <strong>
              {money(
                (Number(packageForm.weight_lb) || 0) *
                (packageForm.shipment_id && imports.find(i => i.id === packageForm.shipment_id)?.transport_mode === "sea" ? 2.60 : 7.00) *
                (Number(imports.find(i => i.id === packageForm.shipment_id)?.exchange_rate) || 0)
              )}
            </strong>
          </div>
          <button className="primary" disabled={savingForm}>{savingForm ? "Guardando…" : "Agregar paquete"}</button>
        </div>
      </form>

      <div className="panel-heading" style={{marginTop:28}}>
        <div><h3>Registrar abono</h3><p className="muted">Guarda cada pago por separado para calcular el saldo.</p></div>
      </div>
      <form className="form-grid import-form-grid" onSubmit={saveImportPayment}>
        <label>Importación
          <select required value={paymentForm.shipment_id} onChange={e=>setPaymentForm({...paymentForm,shipment_id:e.target.value})}>
            <option value="">Selecciona una importación</option>
            {imports.map(i=><option key={i.id} value={i.id}>{i.supplier} — {i.reference || i.ordered_at}</option>)}
          </select>
        </label>
        <label>Tipo de pago
          <select value={paymentForm.payment_type} onChange={e=>setPaymentForm({...paymentForm,payment_type:e.target.value})}>
            <option value="supplier">Compra al proveedor</option>
            <option value="shipping">Envío a la agencia</option>
          </select>
        </label>
        {paymentForm.payment_type === "supplier" && <label>Tienda o plataforma
          <input
            value={paymentForm.store_name}
            onChange={e=>setPaymentForm({...paymentForm,store_name:e.target.value})}
            placeholder="Amazon, eBay, AliExpress..."
          />
        </label>}
        <label>Banco
          <select value={paymentForm.bank_name} onChange={e=>setPaymentForm({
            ...paymentForm,
            bank_name:e.target.value,
            currency:e.target.value === "Banpro" ? "NIO" : paymentForm.currency
          })}>
            <option value="BAC">BAC</option>
            <option value="Lafise">Lafise</option>
            <option value="Banpro">Banpro</option>
          </select>
        </label>
        <label>Moneda de la cuenta
          <select value={paymentForm.currency} onChange={e=>setPaymentForm({...paymentForm,currency:e.target.value})}>
            <option value="NIO">Córdobas (NIO)</option>
            {paymentForm.bank_name !== "Banpro" && <option value="USD">Dólares (USD)</option>}
          </select>
        </label>
        <label>Importe pagado ({paymentForm.currency === "USD" ? "US$" : "C$"})
          <input type="number" min="0.01" step="0.01" required value={paymentForm.amount} onChange={e=>setPaymentForm({...paymentForm,amount:e.target.value})}/>
        </label>
        <label>Fecha
          <input type="date" required value={paymentForm.payment_date} onChange={e=>setPaymentForm({...paymentForm,payment_date:e.target.value})}/>
        </label>
        <label>Método de pago
          <select value={paymentForm.payment_method} onChange={e=>setPaymentForm({...paymentForm,payment_method:e.target.value})}>
            <option value="transfer">Transferencia</option>
            <option value="cash">Efectivo</option>
            <option value="card">Tarjeta</option>
            <option value="other">Otro</option>
          </select>
        </label>
        <label>Referencia del comprobante
          <input value={paymentForm.reference} onChange={e=>setPaymentForm({...paymentForm,reference:e.target.value})}/>
        </label>
        <label>Notas
          <input value={paymentForm.notes} onChange={e=>setPaymentForm({...paymentForm,notes:e.target.value})}/>
        </label>
        <div style={{gridColumn:"1 / -1"}}>
          <button className="primary" disabled={savingForm}>{savingForm ? "Guardando…" : "Registrar pago"}</button>
        </div>
      </form>

      <div className="panel-heading" style={{marginTop:28}}>
        <div><h3>Resumen de costos y saldos</h3><p className="muted">Las compras se consideran pagadas. El saldo refleja únicamente lo pendiente con la agencia de envío.</p></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Importación</th><th>Compra</th><th>Envíos (C$)</th><th>Envíos (US$)</th><th>Costo total</th><th>Pagado a agencia</th><th>Saldo agencia</th></tr></thead>
          <tbody>
          {imports.map(i=>{
            const shipping=(i.import_packages||[]).reduce((a,p)=>a+Number(p.shipping_cost ?? (Number(p.weight_lb||0)*Number(p.rate_per_lb||0))),0);
            const shippingUsd=(i.import_packages||[]).reduce((a,p)=>a+Number(p.shipping_cost_usd||0),0);
            const shippingPaid=(i.import_payments||[]).filter(p=>p.payment_type==="shipping").reduce((a,p)=>a+Number(p.amount||0),0);
            const total=Number(i.purchase_total||0)+shipping;
            const shippingBalance=Math.max(0,shipping-shippingPaid);
            return <tr key={i.id}>
              <td><strong>{i.supplier}</strong><small>{i.reference||"Sin referencia"}</small></td>
              <td>{money(i.purchase_total)}</td><td>{money(shipping)}</td><td>US${shippingUsd.toFixed(2)}</td><td>{money(total)}</td><td>{money(shippingPaid)}</td><td>{money(shippingBalance)}</td>
            </tr>;
          })}
          </tbody>
        </table>
      </div>

      <div className="panel-heading" style={{marginTop:28}}>
        <div><h3>Detalle de paquetes y abonos</h3></div>
      </div>
      {imports.map(i=><div key={i.id} style={{padding:"12px 0",borderBottom:"1px solid #e5e7eb"}}>
        <strong>{i.supplier} — {i.reference||i.ordered_at}</strong>
        {(i.import_packages||[]).map(p=><p key={p.id}>Paquete: {p.tracking_reference||"Sin tracking"} · {p.weight_lb} lb · Tarifa: {p.rate_per_lb_usd != null ? `US$${Number(p.rate_per_lb_usd).toFixed(2)}/lb` : "Tarifa USD no registrada"} · Costo: {p.shipping_cost_usd != null ? `US$${Number(p.shipping_cost_usd).toFixed(2)}` : "Costo USD no registrado"} / {money(p.shipping_cost ?? (Number(p.weight_lb||0)*Number(p.rate_per_lb||0)))} · {p.status}</p>)}
        {(i.import_payments||[]).map(p=><p key={p.id}>
          Pago: {p.payment_date}
          {" · "}{p.payment_type === "supplier" ? "Compra al proveedor" : p.payment_type === "shipping" ? "Envío a la agencia" : "Sin clasificar"}
          {p.store_name ? " · Tienda: " + p.store_name : ""}
          {" · "}{p.bank_name || "Banco no registrado"}
          {" · "}{p.currency === "USD" ? "US$" : p.currency === "NIO" ? "C$" : ""}
          {p.amount_original != null ? Number(p.amount_original).toFixed(2) : money(p.amount)}
          {" · Equivalente: "}{money(p.amount)}
          {" · "}{({transfer:"Transferencia",cash:"Efectivo",card:"Tarjeta",other:"Otro"})[p.payment_method]||p.payment_method}
          {p.reference ? " · "+p.reference : ""}
        </p>)}
      </div>)}
    </>}
  </div>
</section>}

{section === "Finanzas" && isAdmin && (() => {
  const totalSales = financeSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const totalPayments = financePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const totalExpenses = financeExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const deliveryRevenue = financeSales.reduce((sum, sale) => sum + Number(sale.delivery_charge || 0), 0);
  const deliveryCost = financeSales.reduce((sum, sale) => sum + Number(sale.delivery_cost || 0), 0);
  const costMovements = financeMovements.filter(m => m.unit_cost !== null && m.unit_cost !== undefined);
  const documentedCost = costMovements.reduce((sum, movement) =>
    sum + Math.abs(Number(movement.quantity_delta || 0)) * Number(movement.unit_cost || 0), 0);
  const salesWithAnyMovement = new Set(
    financeMovements.map(m => m.related_sale_id).filter(Boolean)
  );
  const salesWithMissingCost = new Set(
    financeMovements
      .filter(m => m.unit_cost === null || m.unit_cost === undefined)
      .map(m => m.related_sale_id)
      .filter(Boolean)
  );
  const salesMissingCost = financeSales.filter(sale =>
    !salesWithAnyMovement.has(sale.id) ||
    salesWithMissingCost.has(sale.id)
  ).length;
  const estimatedResult = totalSales - documentedCost - totalExpenses - deliveryCost;
  const methodLabels = {
    cash: "Efectivo",
    transfer: "Transferencia",
    card: "Tarjeta",
    other: "Otro"
  };

  return <section className="content finance-module">
    <div className="panel">
      <div className="panel-heading finance-heading">
        <div>
          <p className="eyebrow">CONTROL DEL NEGOCIO</p>
          <h3>Finanzas y resultados mensuales</h3>
          <p className="muted">Ventas emitidas, cobros recibidos, costos documentados y gastos operativos.</p>
        </div>
        <label className="finance-month">Mes del reporte
          <input type="month" value={financeMonth} onChange={e => setFinanceMonth(e.target.value)} />
        </label>
      </div>

      {financeError && <div className="warning finance-message">{financeError}</div>}
      {financeLoading && <p className="muted">Actualizando información financiera…</p>}

      <div className="metric-grid finance-metrics">
        <Metric icon={<ReceiptText/>} label="Ventas emitidas" value={money(totalSales)} />
        <Metric icon={<Wallet/>} label="Cobros recibidos" value={money(totalPayments)} />
        <Metric icon={<Wallet/>} label="Gastos operativos" value={money(totalExpenses)} />
        <Metric icon={<Sprout/>} label="Resultado estimado*" value={money(estimatedResult)} />
      </div>

      <div className="finance-summary-grid">
        <div><span>Costos de productos documentados</span><strong>{money(documentedCost)}</strong></div>
        <div><span>Cobros por entrega</span><strong>{money(deliveryRevenue)}</strong></div>
        <div><span>Costos de entrega</span><strong>{money(deliveryCost)}</strong></div>
        <div><span>Margen de entregas</span><strong>{money(deliveryRevenue - deliveryCost)}</strong></div>
      </div>

      <div className="hint finance-message">
        <AlertTriangle size={17}/>
        <span><strong>Importante:</strong> el resultado es parcial cuando faltan costos históricos. En este mes, {salesMissingCost} venta(s) no tienen costo documentado completo. Los cobros recibidos son un dato de caja separado de las ventas emitidas. Las compras de inventario y los abonos de importaciones no se cuentan como gastos operativos.</span>
      </div>
      <p className="muted finance-footnote">*Resultado estimado = ventas emitidas − costos de producto documentados − gastos operativos − costos de entrega. No equivale a utilidad neta definitiva si hay costos faltantes.</p>
    </div>

    <div className="panel">
      <div className="panel-heading">
        <div><h3>{expenseEditing ? "Editar gasto operativo" : "Registrar gasto operativo"}</h3>
          <p className="muted">Publicidad, entregas, empaques, comisiones y otros gastos del negocio.</p>
        </div>
      </div>
      <form className="finance-form" onSubmit={saveFinanceExpense}>
        <label>Descripción
          <input required maxLength="180" value={expenseForm.description}
            onChange={e => setExpenseForm({...expenseForm, description:e.target.value})}
            placeholder="Ej. Publicidad de Instagram" />
        </label>
        <label>Categoría
          <select value={expenseForm.category}
            onChange={e => setExpenseForm({...expenseForm, category:e.target.value})}>
            <option>Publicidad</option>
            <option>Transporte/entregas</option>
            <option>Empaques y materiales</option>
            <option>Comisiones y servicios</option>
            <option>Otros</option>
          </select>
        </label>
        <label>Moneda
          <select value={expenseForm.currency} onChange={e => setExpenseForm({...expenseForm, currency:e.target.value})}>
            <option value="NIO">Córdobas (C$)</option><option value="USD">Dólares (US$)</option>
          </select>
        </label>
        <label>Monto ({expenseForm.currency === "USD" ? "US$" : "C$"})
          <input required type="number" min="0.01" step="0.01" value={expenseForm.amount}
            onChange={e => setExpenseForm({...expenseForm, amount:e.target.value})} placeholder="0.00" />
        </label>
        <label>Fecha
          <input required type="date" value={expenseForm.expense_date}
            onChange={e => setExpenseForm({...expenseForm, expense_date:e.target.value})} />
        </label>
        <label>Método de pago
          <select value={expenseForm.payment_method}
            onChange={e => setExpenseForm({...expenseForm, payment_method:e.target.value})}>
            <option value="cash">Efectivo</option>
            <option value="transfer">Transferencia</option>
            <option value="card">Tarjeta</option>
            <option value="other">Otro</option>
          </select>
        </label>
        <label>Referencia del comprobante (opcional)
          <input maxLength="240" value={expenseForm.receipt_path}
            onChange={e => setExpenseForm({...expenseForm, receipt_path:e.target.value})}
            placeholder="Número de recibo o enlace" />
        </label>
        <div className="finance-actions">
          <button className="primary" type="submit" disabled={expenseSaving}>
            {expenseSaving ? "Guardando…" : expenseEditing ? "Guardar cambios" : "Registrar gasto"}
          </button>
          {expenseEditing && <button className="secondary" type="button" onClick={() => {
            setExpenseEditing(null);
            setExpenseForm({description:"",category:"Publicidad",amount:"",currency:"NIO",
              expense_date:new Date().toLocaleDateString("en-CA"),payment_method:"transfer",receipt_path:""});
          }}>Cancelar edición</button>}
        </div>
      </form>
    </div>

    <div className="panel">
      <div className="panel-heading">
        <div><h3>Historial de gastos</h3><p className="muted">{financeExpenses.length} registro(s) en el mes seleccionado.</p></div>
      </div>
      {!financeExpenses.length && !financeLoading
        ? <Empty text="No hay gastos registrados en este mes." />
        : <div className="table-wrap"><table>
          <thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Método</th><th>Monto</th><th>Acciones</th></tr></thead>
          <tbody>{financeExpenses.map(expense => <tr key={expense.id}>
            <td>{expense.expense_date}</td>
            <td><strong>{expense.description}</strong>{expense.receipt_path && <small>Comprobante: {expense.receipt_path}</small>}</td>
            <td>{expense.category}</td>
            <td>{methodLabels[expense.payment_method] || expense.payment_method}</td>
            <td>{expense.currency === "USD" ? `US$${Number(expense.amount_original || 0).toFixed(2)} · ` : ""}{money(expense.amount)}</td>
            <td><div className="finance-actions">
              <button type="button" className="secondary" onClick={() => editFinanceExpense(expense)}>Editar</button>
              <button type="button" className="secondary danger-action" onClick={() => deleteFinanceExpense(expense)}>Eliminar</button>
            </div></td>
          </tr>)}</tbody>
        </table></div>}
    </div>
  </section>;
})()}
      <footer>Los datos se consultan desde Supabase. Las ventas se procesan mediante una operación transaccional.</footer>
    </main>
  </div>;
}

function Metric({icon,label,value}) {
  return <div className="metric"><div className="metric-icon">{icon}</div><p>{label}</p><strong>{value}</strong></div>;
}
function ProductTable({products,empty,onEdit=null}) {
  if (!products.length) return <Empty text={empty}/>;
  return <div className="table-wrap"><table><thead><tr><th>Producto</th><th>Categoría</th><th>Tipo</th><th>Existencias</th><th>Precio de venta</th>{onEdit && <th>Acciones</th>}</tr></thead><tbody>{products.map(p=><tr key={p.id}><td><strong>{p.name}</strong><small>{p.sku || "Sin SKU"}</small></td><td>{p.category}</td><td>{({finished:"Producto terminado",supply:"Suministro",source_perfume:"Perfume original"})[p.kind] || p.kind}</td><td><span className={Number(p.stock_qty)<=Number(p.low_stock_threshold)?"stock low":"stock"}>{p.stock_qty} {p.sell_unit}</span></td><td>{money(p.sale_price)}</td>{onEdit && <td><button className="secondary" onClick={()=>onEdit(p)}>Editar</button></td>}</tr>)}</tbody></table></div>;
}
function Empty({text}) { return <div className="empty-state"><Package size={28}/><p>{text}</p></div>; }

export default App;
