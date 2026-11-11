import { useCallback, useEffect, useState } from 'react'

const DEMO_ACCOUNTS = [
  { label: 'Agency Alpha Admin', username: 'alpha_admin@synthetic-travel.test', password: 'synth-alpha-admin-pass', badge: 'AGENCY_ALPHA · admin' },
  { label: 'Agency Alpha Sub-Agent', username: 'alpha_sub@synthetic-travel.test', password: 'synth-alpha-sub-pass', badge: 'AGENCY_ALPHA · subagent' },
  { label: 'Agency Beta Admin', username: 'beta_admin@synthetic-travel.test', password: 'synth-beta-admin-pass', badge: 'AGENCY_BETA · admin' },
]

const STATUS_BADGE = {
  CONFIRMED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  HELD: 'bg-amber-100 text-amber-800 border-amber-200',
  CANCELLED: 'bg-rose-100 text-rose-800 border-rose-200',
  PAID: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  UNPAID: 'bg-amber-100 text-amber-800 border-amber-200',
  REFUNDED: 'bg-indigo-100 text-indigo-800 border-indigo-200',
}

async function reqJson(url, options = {}, token = null) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, { ...options, headers })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { detail: text }
  }
  if (!res.ok) {
    throw new Error(data?.detail || `HTTP ${res.status}`)
  }
  return data
}

export default function App() {
  const [simInfo, setSimInfo] = useState({ version: 'v1.0', db_backend: 'sqlite', bookings_count: 0 })
  const [token, setToken] = useState(() => localStorage.getItem('tbo_demo_token') || '')
  const [profile, setProfile] = useState(null)
  const [activeTab, setActiveTab] = useState('search')

  const [username, setUsername] = useState(DEMO_ACCOUNTS[0].username)
  const [password, setPassword] = useState(DEMO_ACCOUNTS[0].password)

  const [cityQuery, setCityQuery] = useState('')
  const [inventory, setInventory] = useState([])
  const [quantities, setQuantities] = useState({})
  const [activeHold, setActiveHold] = useState(null)
  const [couponCode, setCouponCode] = useState('SAVE20')
  const [travellerName, setTravellerName] = useState('Rohan Synthetic')
  const [travellerPassport, setTravellerPassport] = useState('SYNTH-PASS-DEMO-77')
  const [travellerEmail, setTravellerEmail] = useState('rohan@synthetic-traveller.test')

  const [bookings, setBookings] = useState([])
  const [displayNameInput, setDisplayNameInput] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('https://approved-supplier.internal/hook')
  const [webhookResp, setWebhookResp] = useState(null)

  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const fetchSim = useCallback(async () => {
    try {
      const info = await reqJson('/__sim/version')
      setSimInfo(info)
    } catch {
      // Ignore if backend temporarily restarting
    }
  }, [])

  const loadWorkspace = useCallback(async (tok) => {
    if (!tok) return
    try {
      const [me, inv, bks] = await Promise.all([
        reqJson('/api/v3/users/me', {}, tok),
        reqJson('/api/v3/search', {}, tok),
        reqJson('/api/v3/bookings', {}, tok),
      ])
      setProfile(me)
      setDisplayNameInput(me.display_name)
      setInventory(inv.results || [])
      setBookings(bks.bookings || [])
      setError('')
    } catch (err) {
      if (err.message.toLowerCase().includes('jwt') || err.message.toLowerCase().includes('token')) {
        localStorage.removeItem('tbo_demo_token')
        setToken('')
        setProfile(null)
      }
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    fetchSim()
  }, [fetchSim])

  useEffect(() => {
    if (token) loadWorkspace(token)
  }, [token, loadWorkspace])

  const handleLogin = async (u, p) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const data = await reqJson('/api/v3/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: u, password: p }),
      })
      localStorage.setItem('tbo_demo_token', data.access_token)
      setToken(data.access_token)
      setNotice(`Signed in as ${data.agency_id} (${data.role})`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = async () => {
    try {
      if (token) await reqJson('/api/v3/auth/logout', { method: 'POST' }, token)
    } catch {
      // ignore logout error
    }
    localStorage.removeItem('tbo_demo_token')
    setToken('')
    setProfile(null)
    setActiveHold(null)
    setBookings([])
    setNotice('Signed out cleanly.')
  }

  const handleSearch = async (e) => {
    e?.preventDefault()
    setBusy(true)
    setError('')
    try {
      const q = cityQuery.trim() ? `?city=${encodeURIComponent(cityQuery.trim())}` : ''
      const res = await reqJson(`/api/v3/search${q}`, {}, token)
      setInventory(res.results || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleHold = async (itemId) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const qty = Number(quantities[itemId] || 1)
      const hold = await reqJson('/api/v3/holds', {
        method: 'POST',
        body: JSON.stringify({ item_id: itemId, quantity: qty }),
      }, token)
      setActiveHold(hold)
      setNotice(`Created hold ${hold.hold_id} ($${hold.quoted_fare})`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleApplyCoupon = async () => {
    if (!activeHold) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const updated = await reqJson('/api/v3/coupons/apply', {
        method: 'POST',
        body: JSON.stringify({ hold_id: activeHold.hold_id, code: couponCode }),
      }, token)
      setActiveHold(updated)
      setNotice(`Applied ${couponCode}: quoted fare is now $${updated.quoted_fare}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleBook = async (e) => {
    e.preventDefault()
    if (!activeHold) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const created = await reqJson('/api/v3/bookings', {
        method: 'POST',
        body: JSON.stringify({
          hold_id: activeHold.hold_id,
          traveller_name: travellerName,
          traveller_passport: travellerPassport,
          traveller_email: travellerEmail,
        }),
      }, token)
      setActiveHold(null)
      setNotice(`Booking ${created.booking_id} created and persisted to SQLite!`)
      await Promise.all([loadWorkspace(token), fetchSim()])
      setActiveTab('bookings')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const bookingAction = async (bookingId, action, body = null) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const updated = await reqJson(
        `/api/v3/bookings/${bookingId}/${action}`,
        { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) },
        token
      )
      setNotice(`Booking ${bookingId}: ${action} completed (${updated.status} / ${updated.payment_status})`)
      await Promise.all([loadWorkspace(token), fetchSim()])
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const updated = await reqJson(
        '/api/v3/users/me',
        { method: 'PATCH', body: JSON.stringify({ display_name: displayNameInput }) },
        token
      )
      setProfile((prev) => ({ ...prev, ...updated }))
      setNotice('Profile saved to SQLite database.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleTestWebhook = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setWebhookResp(null)
    try {
      const res = await reqJson(
        '/api/v3/suppliers/webhook-test',
        { method: 'POST', body: JSON.stringify({ callback_url: webhookUrl, event_type: 'booking.confirmed' }) },
        token
      )
      setWebhookResp(res)
      setNotice('Webhook callback checked.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const switchRelease = async (version, reset = false) => {
    setBusy(true)
    setError('')
    try {
      if (reset) {
        await reqJson('/__sim/reset', { method: 'POST', body: JSON.stringify({ version }) })
        setActiveHold(null)
        setNotice(`SQLite demo database reset to clean ${version} seed state.`)
      } else {
        await reqJson('/__sim/version', { method: 'POST', body: JSON.stringify({ version }) })
        setNotice(`Target portal switched to ${version}.`)
      }
      await fetchSim()
      if (token) await loadWorkspace(token)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white shadow-xs">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
              TBO
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900">TBO PartnerDesk</h1>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                  Release {simInfo.version}
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  SQLite DB · {simInfo.bookings_count} bookings
                </span>
              </div>
              <p className="text-xs text-slate-500">B2B Travel Distribution Portal (Synthetic Demo Environment)</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {['v1.0', 'v1.1', 'v1.2'].map((ver) => (
              <button
                key={ver}
                disabled={busy}
                onClick={() => switchRelease(ver, false)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                  simInfo.version === ver
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                {ver}
              </button>
            ))}
            <button
              disabled={busy}
              onClick={() => switchRelease(simInfo.version, true)}
              className="rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
            >
              Reset DB
            </button>
            {profile && (
              <button
                onClick={handleLogout}
                className="ml-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
              >
                Logout
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {notice && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800">
            {notice}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-800">
            {error}
          </div>
        )}

        {!token ? (
          <div className="mx-auto mt-8 grid max-w-4xl gap-6 md:grid-cols-2">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleLogin(username, password)
              }}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
            >
              <h2 className="text-base font-semibold text-slate-900">Agency Partner Login</h2>
              <p className="mt-1 text-xs text-slate-500">Sign in to search rates, hold rooms/flights, and issue vouchers.</p>
              <div className="mt-4 space-y-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-700">Partner Email</label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  />
                </div>
                <button
                  disabled={busy}
                  type="submit"
                  className="w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
                >
                  Sign In
                </button>
              </div>
            </form>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <h3 className="text-base font-semibold text-slate-900">Synthetic Demo Accounts</h3>
              <p className="mt-1 text-xs text-slate-500">
                1-click sign-in across two isolated agencies (Agency Alpha & Agency Beta) and roles.
              </p>
              <div className="mt-4 space-y-2.5">
                {DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.username}
                    disabled={busy}
                    onClick={() => {
                      setUsername(acc.username)
                      setPassword(acc.password)
                      handleLogin(acc.username, acc.password)
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-blue-300 hover:bg-blue-50/50"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900">{acc.label}</div>
                      <div className="text-xs text-slate-500">{acc.username}</div>
                    </div>
                    <span className="rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                      {acc.badge}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Agency Summary Banner */}
            {profile && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-3.5 shadow-xs">
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <span>
                    <strong className="text-slate-500">Agency:</strong>{' '}
                    <span className="font-semibold text-slate-900">{profile.agency_id}</span>
                  </span>
                  <span>
                    <strong className="text-slate-500">User:</strong>{' '}
                    <span className="font-semibold text-slate-900">{profile.display_name}</span>
                  </span>
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 font-semibold text-blue-700">
                    Role: {profile.role}
                  </span>
                  <span>
                    <strong className="text-slate-500">Credit Limit:</strong>{' '}
                    <span className="font-semibold text-emerald-700">${Number(profile.credit_limit).toLocaleString()}</span>
                  </span>
                </div>
                <div className="flex gap-2">
                  {[
                    { id: 'search', label: 'Search & Book' },
                    { id: 'bookings', label: `My Bookings (${bookings.length})` },
                    { id: 'settings', label: 'Profile & Supplier Hook' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                        activeTab === tab.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 1: Search, Hold & Book */}
            {activeTab === 'search' && (
              <div className="grid gap-6 lg:grid-cols-12">
                <div className="space-y-4 lg:col-span-7">
                  <form onSubmit={handleSearch} className="flex gap-2">
                    <input
                      placeholder="Filter by city (e.g., New Delhi, Dubai, Singapore, London)..."
                      value={cityQuery}
                      onChange={(e) => setCityQuery(e.target.value)}
                      className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900"
                    />
                    <button
                      type="submit"
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Search
                    </button>
                  </form>

                  <div className="space-y-3">
                    {inventory.map((item) => (
                      <div
                        key={item.item_id}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                              {item.type}
                            </span>
                            <span className="font-mono text-xs text-slate-400">{item.item_id}</span>
                          </div>
                          <div className="mt-1 text-base font-semibold text-slate-900">{item.title}</div>
                          <div className="text-xs text-slate-500">{item.city}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-lg font-bold text-slate-900">${item.unit_fare}</div>
                            <div className="text-[11px] text-slate-500">per unit · {item.currency}</div>
                          </div>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={quantities[item.item_id] ?? 1}
                            onChange={(e) => setQuantities({ ...quantities, [item.item_id]: e.target.value })}
                            className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-center text-sm"
                          />
                          <button
                            disabled={busy}
                            onClick={() => handleHold(item.item_id)}
                            className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                          >
                            Hold Rate
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-5">
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                    <h3 className="text-sm font-semibold text-slate-900">Active Hold & Booking Checkout</h3>
                    {!activeHold ? (
                      <p className="mt-2 text-xs text-slate-500">
                        Select any hotel, flight, or sightseeing package on the left and click <strong>Hold Rate</strong>.
                      </p>
                    ) : (
                      <div className="mt-4 space-y-4 text-xs">
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                          <div className="flex justify-between font-semibold text-blue-900">
                            <span>{activeHold.hold_id}</span>
                            <span>${activeHold.quoted_fare}</span>
                          </div>
                          <div className="mt-1 text-blue-700">
                            Item {activeHold.item_id} · Qty {activeHold.quantity} · Discount ${activeHold.discount_applied}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <input
                            value={couponCode}
                            onChange={(e) => setCouponCode(e.target.value)}
                            placeholder="Coupon (SAVE20 / CORP50)"
                            className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5"
                          />
                          <button
                            type="button"
                            disabled={busy}
                            onClick={handleApplyCoupon}
                            className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-200"
                          >
                            Apply Coupon
                          </button>
                        </div>

                        <form onSubmit={handleBook} className="space-y-2.5 border-t border-slate-200 pt-3">
                          <div>
                            <label className="block font-medium text-slate-700">Traveller Full Name</label>
                            <input
                              value={travellerName}
                              onChange={(e) => setTravellerName(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                              required
                            />
                          </div>
                          <div>
                            <label className="block font-medium text-slate-700">Synthetic Passport ID</label>
                            <input
                              value={travellerPassport}
                              onChange={(e) => setTravellerPassport(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                              required
                            />
                          </div>
                          <div>
                            <label className="block font-medium text-slate-700">Traveller Email</label>
                            <input
                              type="email"
                              value={travellerEmail}
                              onChange={(e) => setTravellerEmail(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                              required
                            />
                          </div>
                          <button
                            disabled={busy}
                            type="submit"
                            className="mt-2 w-full rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700"
                          >
                            Create Booking (${activeHold.quoted_fare})
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: My Bookings */}
            {activeTab === 'bookings' && (
              <div className="space-y-3">
                {bookings.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
                    No bookings for this agency yet.
                  </div>
                ) : (
                  bookings.map((b) => (
                    <div
                      key={b.booking_id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
                    >
                      <div className="space-y-1 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold text-slate-900">{b.booking_id}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[b.status] || ''}`}>
                            {b.status}
                          </span>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[b.payment_status] || ''}`}>
                            {b.payment_status}
                          </span>
                          {b.voucher_code && (
                            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700">
                              Voucher: {b.voucher_code}
                            </span>
                          )}
                        </div>
                        <div className="text-slate-700">
                          <strong>{b.traveller_name}</strong> · Passport <code className="text-slate-600">{b.traveller_passport}</code> · {b.item_id} (Qty {b.quantity})
                        </div>
                        <div className="text-slate-500">
                          Total Fare: <strong>${b.total_fare}</strong> · Paid: <strong>${b.paid_amount}</strong> · Refunded: <strong>${b.refunded_amount}</strong>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs">
                        {b.payment_status === 'UNPAID' && (
                          <button
                            disabled={busy}
                            onClick={() => bookingAction(b.booking_id, 'pay', { amount: b.total_fare })}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700"
                          >
                            Pay ${b.total_fare}
                          </button>
                        )}
                        {b.status === 'HELD' && (
                          <button
                            disabled={busy}
                            onClick={() => bookingAction(b.booking_id, 'confirm')}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700"
                          >
                            Confirm & Issue Voucher
                          </button>
                        )}
                        {b.status !== 'CANCELLED' && (
                          <button
                            disabled={busy}
                            onClick={() => bookingAction(b.booking_id, 'cancel')}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 font-medium text-rose-700 hover:bg-rose-100"
                          >
                            Cancel
                          </button>
                        )}
                        {b.status === 'CANCELLED' && b.paid_amount > 0 && (
                          <button
                            disabled={busy}
                            onClick={() => bookingAction(b.booking_id, 'refund')}
                            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 font-medium text-indigo-700 hover:bg-indigo-100"
                          >
                            Request Refund
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab 3: Profile & Supplier Webhook */}
            {activeTab === 'settings' && (
              <div className="grid gap-6 md:grid-cols-2">
                <form onSubmit={handleSaveProfile} className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                  <h3 className="text-sm font-semibold text-slate-900">Partner Profile</h3>
                  <div className="mt-3 space-y-3 text-xs">
                    <div>
                      <label className="block font-medium text-slate-700">Display Name</label>
                      <input
                        value={displayNameInput}
                        onChange={(e) => setDisplayNameInput(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </div>
                    <button
                      disabled={busy}
                      type="submit"
                      className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
                    >
                      Save Profile
                    </button>
                  </div>
                </form>

                <form onSubmit={handleTestWebhook} className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                  <h3 className="text-sm font-semibold text-slate-900">Supplier Callback Webhook Tester</h3>
                  <div className="mt-3 space-y-3 text-xs">
                    <div>
                      <label className="block font-medium text-slate-700">Callback URL</label>
                      <input
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                      />
                    </div>
                    <button
                      disabled={busy}
                      type="submit"
                      className="rounded-lg bg-slate-800 px-4 py-2 font-medium text-white hover:bg-slate-900"
                    >
                      Test Webhook
                    </button>
                    {webhookResp && (
                      <pre className="rounded-lg bg-slate-100 p-2 font-mono text-[11px] text-slate-800">
                        {JSON.stringify(webhookResp, null, 2)}
                      </pre>
                    )}
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
