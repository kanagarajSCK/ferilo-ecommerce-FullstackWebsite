import { useEffect, useState, createContext, useContext, useMemo, useRef } from 'react';
import { Routes, Route, Link, NavLink, Outlet, Navigate, useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import {
  fetchMe,
  loginRequest,
  registerRequest,
  logoutRequest,
  refreshAccessToken,
  clearAccessToken,
  setAccessToken,
  updateProfile,
  fetchVerificationStatus,
  submitVerification,
  fetchAdminVerifications,
  approveVerification,
  rejectVerification,
  fetchProducts,
  fetchProduct,
  fetchMyProduct,
  fetchMyProducts,
  createProduct,
  updateProduct,
  publishProduct,
  deleteProduct,
  uploadProductImages,
  deleteProductImage,
  fetchCategories,
  fetchCategoryBySlug,
  fetchFavoriteIds,
  fetchFavorites,
  addFavorite,
  removeFavorite,
  fetchMyOffers,
  fetchIncomingOffers,
  createOffer,
  acceptOffer,
  rejectOffer,
  counterOffer,
  cancelOffer,
  fetchConversations,
  startConversation,
  fetchConversation,
  sendMessage,
  markConversationRead,
  fetchOrderQuote,
  fetchMyOrders,
  fetchSalesOrders,
  fetchOrder,
  createOrder,
  confirmOrder,
  updateOrderStatus,
  completeOrder,
  cancelOrder,
  fetchOrderReviews,
  createReview,
  fetchUserReviews,
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  createReport,
  fetchMyReports,
  fetchAdminStats,
  fetchAdminUsers,
  updateAdminUserStatus,
  fetchAdminProducts,
  updateAdminProductStatus,
  fetchAdminOrders,
  fetchAdminReports,
  updateAdminReport,
  fetchCategoriesPublic,
  fetchAreasPublic,
  fetchFeaturedProductsPublic,
  subscribeDataSource,
  getDataSource,
} from './api';
import { FALLBACK_CATEGORIES } from './fallbackData';

const AuthContext = createContext(null);
const FavoritesContext = createContext(null);
const NotificationsContext = createContext(null);
const AreaContext = createContext(null);

const NOTIFICATION_POLL_MS = 45000;
const AREA_STORAGE_KEY = 'ferilo_area';

/** Service areas focused on Rupandehi & Kapilvastu (Lumbini Province). */
const SERVICE_AREAS = [
  { city: '', district: '', label: 'All areas' },
  { city: 'Bhairahawa', district: 'Rupandehi', label: 'Bhairahawa' },
  { city: 'Butwal', district: 'Rupandehi', label: 'Butwal' },
  { city: 'Lumbini', district: 'Rupandehi', label: 'Lumbini' },
  { city: 'Tilottama', district: 'Rupandehi', label: 'Tilottama' },
  { city: 'Sainamaina', district: 'Rupandehi', label: 'Sainamaina' },
  { city: 'Devdaha', district: 'Rupandehi', label: 'Devdaha' },
  { city: 'Manigram', district: 'Rupandehi', label: 'Manigram' },
  { city: 'Taulihawa', district: 'Kapilvastu', label: 'Taulihawa' },
  { city: 'Krishnanagar', district: 'Kapilvastu', label: 'Krishnanagar' },
  { city: 'Kapilvastu', district: 'Kapilvastu', label: 'Kapilvastu' },
  { city: 'Bahadurganj', district: 'Kapilvastu', label: 'Bahadurganj' },
];

const DEFAULT_CITY = 'Bhairahawa';
const DEFAULT_DISTRICT = 'Rupandehi';

function useAuth() {
  return useContext(AuthContext);
}

function useFavorites() {
  return useContext(FavoritesContext);
}

function useNotifications() {
  return useContext(NotificationsContext);
}

function useArea() {
  return useContext(AreaContext);
}

function AreaProvider({ children }) {
  const [area, setAreaState] = useState(() => {
    try {
      const raw = localStorage.getItem(AREA_STORAGE_KEY);
      if (!raw) return { city: '', district: '' };
      const parsed = JSON.parse(raw);
      return { city: parsed.city || '', district: parsed.district || '' };
    } catch {
      return { city: '', district: '' };
    }
  });

  const setArea = (next) => {
    const value = { city: next.city || '', district: next.district || '' };
    setAreaState(value);
    localStorage.setItem(AREA_STORAGE_KEY, JSON.stringify(value));
  };

  return (
    <AreaContext.Provider value={{ area, setArea, areas: SERVICE_AREAS }}>
      {children}
    </AreaContext.Provider>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

function FavoritesProvider({ children }) {
  const { user } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [loading, setLoading] = useState(false);

  const refreshFavorites = async () => {
    if (!user) {
      setFavoriteIds([]);
      return;
    }
    setLoading(true);
    try {
      const ids = await fetchFavoriteIds();
      setFavoriteIds(ids);
    } catch {
      setFavoriteIds([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setFavoriteIds([]);
      return undefined;
    }
    setLoading(true);
    fetchFavoriteIds()
      .then((ids) => { if (!cancelled) setFavoriteIds(ids); })
      .catch(() => { if (!cancelled) setFavoriteIds([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  const isFavorite = (productId) => favoriteIds.includes(productId);

  const toggleFavorite = async (productId) => {
    if (isFavorite(productId)) {
      await removeFavorite(productId);
      setFavoriteIds((prev) => prev.filter((id) => id !== productId));
      return false;
    }
    await addFavorite(productId);
    setFavoriteIds((prev) => [...prev, productId]);
    return true;
  };

  return (
    <FavoritesContext.Provider value={{ favoriteIds, isFavorite, toggleFavorite, refreshFavorites, loading }}>
      {children}
    </FavoritesContext.Provider>
  );
}

function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return undefined;
    }
    let cancelled = false;
    const load = () => {
      fetchUnreadNotificationCount()
        .then((count) => { if (!cancelled) setUnreadCount(count); })
        .catch(() => { /* polling failures are not worth surfacing */ });
    };
    load();
    const timer = setInterval(load, NOTIFICATION_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [user]);

  return (
    <NotificationsContext.Provider value={{ unreadCount, setUnreadCount }}>
      {children}
    </NotificationsContext.Provider>
  );
}

function NotificationBell() {
  const { unreadCount } = useNotifications();

  return (
    <Link
      to="/app/notifications"
      className="notif-bell"
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
    >
      <span aria-hidden="true">🔔</span>
      {unreadCount > 0 && (
        <span className="notif-bell__badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
      )}
    </Link>
  );
}

function FavoriteButton({ productId, sellerId, className = '' }) {
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const active = isFavorite(productId);
  const isOwnListing = user && sellerId && user.id === sellerId;

  if (isOwnListing) return null;

  const handleClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      navigate('/login');
      return;
    }
    setBusy(true);
    try {
      await toggleFavorite(productId);
    } catch (err) {
      window.alert(err.response?.data?.error?.message || 'Could not update favorites.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`favorite-btn ${active ? 'favorite-btn--active' : ''} ${className}`.trim()}
      onClick={handleClick}
      disabled={busy}
      aria-label={active ? 'Remove from favorites' : 'Save to favorites'}
      aria-pressed={active}
    >
      {active ? '♥' : '♡'}
    </button>
  );
}

const CONDITIONS = [
  { value: 'NEW_LIKE', label: 'Like New' },
  { value: 'GOOD', label: 'Good' },
  { value: 'FAIR', label: 'Fair' },
  { value: 'POOR', label: 'Poor' },
];

const SIZE_TIERS = [
  { value: 'SMALL', label: 'Small' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LARGE', label: 'Large' },
  { value: 'EXTRA_LARGE', label: 'Extra Large' },
];

const OFFER_STATUS_LABELS = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  COUNTERED: 'Countered',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
};

const ORDER_STATUS_LABELS = {
  PENDING: 'Pending confirmation',
  CONFIRMED: 'Confirmed',
  READY_FOR_MEETUP: 'Ready for meetup',
  READY_FOR_DELIVERY: 'Ready for delivery',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  DISPUTED: 'Disputed',
};

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'popular', label: 'Most popular' },
];

function filtersFromSearchParams(searchParams, fixedCategoryId) {
  return {
    q: searchParams.get('q') || '',
    categoryId: fixedCategoryId ? String(fixedCategoryId) : (searchParams.get('categoryId') || ''),
    city: searchParams.get('city') || '',
    district: searchParams.get('district') || '',
    condition: searchParams.get('condition') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    sort: searchParams.get('sort') || 'newest',
    verifiedOnly: searchParams.get('verifiedOnly') === 'true',
    page: searchParams.get('page') || '1',
  };
}

function searchParamsFromFilters(filters) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.city.trim()) params.set('city', filters.city.trim());
  if (filters.district.trim()) params.set('district', filters.district.trim());
  if (filters.condition) params.set('condition', filters.condition);
  if (filters.minPrice !== '') params.set('minPrice', filters.minPrice);
  if (filters.maxPrice !== '') params.set('maxPrice', filters.maxPrice);
  if (filters.sort && filters.sort !== 'newest') params.set('sort', filters.sort);
  if (filters.verifiedOnly) params.set('verifiedOnly', 'true');
  if (filters.page && filters.page !== '1') params.set('page', filters.page);
  return params;
}

function buildProductQuery(filters) {
  const params = { limit: 24, page: Number(filters.page) || 1 };
  if (filters.q.trim()) params.q = filters.q.trim();
  if (filters.categoryId) params.categoryId = filters.categoryId;
  if (filters.city.trim()) params.city = filters.city.trim();
  if (filters.district.trim()) params.district = filters.district.trim();
  if (filters.condition) params.condition = filters.condition;
  if (filters.minPrice !== '') params.minPrice = filters.minPrice;
  if (filters.maxPrice !== '') params.maxPrice = filters.maxPrice;
  if (filters.sort) params.sort = filters.sort;
  if (filters.verifiedOnly) params.verifiedOnly = true;
  return params;
}

function formatPrice(price) {
  return `Rs. ${Number(price).toLocaleString('en-NP')}`;
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        await refreshAccessToken();
        const me = await fetchMe();
        setUser(me);
      } catch {
        // Restore portfolio offline demo session if present
        try {
          const raw = sessionStorage.getItem('ferilo_offline_user');
          if (raw) {
            setAccessToken('offline-demo-token');
            setUser(JSON.parse(raw));
            return;
          }
        } catch {
          /* ignore */
        }
        clearAccessToken();
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email, password) => {
    const u = await loginRequest(email, password);
    setUser(u);
    return u;
  };

  const register = async (email, password, displayName) => {
    const u = await registerRequest(email, password, displayName);
    setUser(u);
    return u;
  };

  const logout = async () => {
    await logoutRequest();
    setUser(null);
  };

  const refreshUser = async () => {
    const me = await fetchMe();
    setUser(me);
    return me;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

function HeaderSearch() {
  const navigate = useNavigate();
  const { area } = useArea();
  const [query, setQuery] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (area.city) params.set('city', area.city);
    if (area.district) params.set('district', area.district);
    navigate(params.toString() ? `/browse?${params.toString()}` : '/browse');
  };

  return (
    <form className="header__search" onSubmit={handleSubmit}>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search listings…"
        aria-label="Search listings"
      />
      <button type="submit" className="header__search-btn">Search</button>
    </form>
  );
}

function AreaSelect() {
  const { area, setArea, areas } = useArea();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const currentValue = area.city ? `${area.city}|${area.district}` : '';

  const handleChange = (e) => {
    const value = e.target.value;
    const selected = areas.find((a) => (a.city ? `${a.city}|${a.district}` : '') === value)
      || { city: '', district: '' };
    setArea(selected);

    if (location.pathname === '/browse' || location.pathname.startsWith('/categories/')) {
      const params = new URLSearchParams(searchParams);
      if (selected.city) params.set('city', selected.city);
      else params.delete('city');
      if (selected.district) params.set('district', selected.district);
      else params.delete('district');
      params.delete('page');
      navigate(`${location.pathname}?${params.toString()}`, { replace: true });
    }
  };

  return (
    <label className="header__area">
      <span className="sr-only">Area</span>
      <select value={currentValue} onChange={handleChange} aria-label="Select area">
        {areas.map((a) => (
          <option key={a.label} value={a.city ? `${a.city}|${a.district}` : ''}>
            {a.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DataSourceBadge() {
  const [dataSource, setDataSource] = useState(getDataSource);

  useEffect(() => subscribeDataSource(setDataSource), []);

  return (
    <span
      className={`categories__badge categories__badge--${dataSource}`}
      title={
        dataSource === 'live'
          ? 'Connected to the live API and database'
          : 'Showing portfolio backup data while the API/database wakes up or is offline'
      }
    >
      {dataSource === 'live' ? 'Live from database' : 'Offline preview — connecting…'}
    </span>
  );
}

function SubNavLink({ to, children, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => (isActive ? 'subnav__link subnav__link--active' : 'subnav__link')}
    >
      {children}
    </NavLink>
  );
}

function Header() {
  const { user, logout } = useAuth();
  const [navPhoto, setNavPhoto] = useState(() => {
    try {
      return localStorage.getItem('ferilo_admin_photo') || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const syncPhoto = () => {
      try {
        setNavPhoto(localStorage.getItem('ferilo_admin_photo') || null);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', syncPhoto);
    return () => window.removeEventListener('storage', syncPhoto);
  }, []);

  const displayName = user ? (user.displayName || user.email) : '';
  const initial = displayName ? displayName.trim().charAt(0).toUpperCase() : 'U';

  return (
    <header className="header">
      <div className="header__top">
        <div className="container header__inner">
          <Link to="/" className="header__logo">
            <span className="header__logo-mark">F</span>
            <span className="header__logo-text">FERILO</span>
          </Link>
          <DataSourceBadge />
          <AreaSelect />
          <HeaderSearch />
          <div className="header__actions">
            {user ? (
              <>
                <NotificationBell />
                <Link
                  to="/app/dashboard"
                  className="header__user"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                >
                  <span
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      overflow: 'hidden',
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '13px',
                      fontWeight: '700',
                      flexShrink: 0,
                    }}
                  >
                    {navPhoto ? (
                      <img
                        src={navPhoto}
                        alt={displayName}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      initial
                    )}
                  </span>
                  <span>{displayName}</span>
                </Link>
                <button type="button" className="header__btn header__btn--ghost" onClick={logout}>
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="header__btn header__btn--ghost">Login</Link>
                <Link to="/register" className="header__btn header__btn--primary">Sign Up</Link>
              </>
            )}
          </div>
        </div>
      </div>
      <nav className="subnav" aria-label="Primary">
        <div className="container subnav__inner">
          <SubNavLink to="/" end>Dashboard</SubNavLink>
          <SubNavLink to="/browse">All Items</SubNavLink>
          {user && <SubNavLink to="/app/favorites">Favorites</SubNavLink>}
          {user && <SubNavLink to="/app/offers">Offers</SubNavLink>}
          {user && <SubNavLink to="/app/messages">Messages</SubNavLink>}
          {user && <SubNavLink to="/app/orders">Orders</SubNavLink>}
          <SubNavLink to="/help">Help</SubNavLink>
        </div>
      </nav>
    </header>
  );
}

function Footer() {
  const year = new Date().getFullYear();
  const companyLinks = [
    { label: 'About Us', to: '/about' },
    { label: 'Contact Us', to: '/contact' },
  ];
  const helpLinks = [
    { label: 'Help Center', to: '/help' },
    { label: 'How to Buy', to: '/help/how-to-buy' },
    { label: 'How to Sell', to: '/help/how-to-sell' },
    { label: 'Safety Tips', to: '/help/safety' },
    { label: 'Blog', to: '/blog' },
  ];
  const policyLinks = [
    { label: 'Terms and Conditions', to: '/terms' },
    { label: 'Privacy Policy', to: '/privacy' },
    { label: 'Prohibited & Restricted Items', to: '/policies/prohibited-items' },
    { label: 'Returns, Refunds & Disputes', to: '/policies/returns' },
    { label: 'Community Guidelines', to: '/community-guidelines' },
  ];

  return (
    <footer className="footer">
      <div className="container footer__grid">
        <section className="footer__brand" aria-labelledby="footer-brand-heading">
          <h2 id="footer-brand-heading" className="footer__logo">FERILO</h2>
          <p className="footer__tagline">
            FERILO is an open-source second-hand marketplace demo for Nepal — connecting you to local
            sellers for electronics, furniture, vehicles, and more. In-app identity checks help build trust; this is not a government-licensed service.
          </p>
        </section>
        <nav className="footer__column" aria-labelledby="footer-company-heading">
          <h3 id="footer-company-heading" className="footer__heading">Company</h3>
          <ul className="footer__links">
            {companyLinks.map((link) => (
              <li key={link.to}><Link to={link.to}>{link.label}</Link></li>
            ))}
          </ul>
        </nav>
        <nav className="footer__column" aria-labelledby="footer-help-heading">
          <h3 id="footer-help-heading" className="footer__heading">Help &amp; Support</h3>
          <ul className="footer__links">
            {helpLinks.map((link) => (
              <li key={link.to}><Link to={link.to}>{link.label}</Link></li>
            ))}
          </ul>
        </nav>
        <nav className="footer__column" aria-labelledby="footer-policies-heading">
          <h3 id="footer-policies-heading" className="footer__heading">Policies</h3>
          <ul className="footer__links">
            {policyLinks.map((link) => (
              <li key={link.to}><Link to={link.to}>{link.label}</Link></li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="footer__bottom">
        <div className="container"><p>© {year} FERILO — Made in Nepal</p></div>
      </div>
    </footer>
  );
}

function HomePage() {
  const { setArea } = useArea();
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);
  const [areaStats, setAreaStats] = useState([]);
  const [featured, setFeatured] = useState([]);

  const areaCards = useMemo(() => {
    const countMap = new Map(
      areaStats.map((a) => [`${a.city}|${a.district}`, a.listingCount]),
    );
    return SERVICE_AREAS.filter((a) => a.city).map((a) => ({
      ...a,
      listingCount: countMap.get(`${a.city}|${a.district}`) || 0,
    })).sort((a, b) => b.listingCount - a.listingCount || a.label.localeCompare(b.label));
  }, [areaStats]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [cats, areas, featuredItems] = await Promise.all([
        fetchCategoriesPublic(),
        fetchAreasPublic(),
        fetchFeaturedProductsPublic(),
      ]);
      if (!cancelled) {
        setCategories(Array.isArray(cats) ? cats : FALLBACK_CATEGORIES);
        setAreaStats(Array.isArray(areas) ? areas : []);
        setFeatured(Array.isArray(featuredItems) ? featuredItems : []);
      }
    }
    load();
    const retry = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(retry); };
  }, []);

  return (
    <div className="home">
      <section className="hero">
        <div className="container hero__inner">
          <p className="hero__eyebrow">Community marketplace demo for Nepal</p>
          <h1 className="hero__title">Buy. Sell. <span className="hero__highlight">Give It Another Life.</span></h1>
          <p className="hero__subtitle">Discover second-hand deals from sellers across Rupandehi, Kapilvastu, and Lumbini. Identity-checked profiles are a platform feature — not a government certification.</p>
        </div>
      </section>
      <section className="categories">
        <div className="container">
          <div className="categories__head">
            <h2>Browse categories</h2>
            <DataSourceBadge />
          </div>
          <ul className="categories__grid">
            {categories.map((cat) => (
              <li key={cat.slug}>
                <Link to={`/categories/${cat.slug}`} className="categories__card">
                  <span className="categories__icon" aria-hidden="true">{cat.icon || '📦'}</span>
                  <span>{cat.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="areas">
        <div className="container">
          <div className="areas__head">
            <h2>Browse by City</h2>
            <Link to="/browse" className="areas__view-all" onClick={() => setArea({ city: '', district: '' })}>
              View all cities →
            </Link>
          </div>
          <ul className="areas__grid">
            {areaCards.map((area) => {
              const params = new URLSearchParams({ city: area.city, district: area.district });
              return (
                <li key={`${area.city}-${area.district}`}>
                  <Link
                    to={`/browse?${params.toString()}`}
                    className="areas__card"
                    onClick={() => setArea(area)}
                  >
                    <span className="areas__city">{area.label}</span>
                    <span className="areas__count">
                      {area.listingCount} listing{area.listingCount === 1 ? '' : 's'}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
      {featured.length > 0 && (
        <section className="featured">
          <div className="container">
            <div className="areas__head">
              <h2>Featured Listings</h2>
              <Link to="/browse?sort=popular" className="areas__view-all">View all →</Link>
            </div>
            <ul className="featured__grid">
              {featured.map((p) => (
                <li key={p.id}>
                  <Link to={`/products/${p.id}`} className="featured__card">
                    <div className="featured__img">
                      {p.images?.[0]?.url ? (
                        <img src={p.images[0].url} alt="" loading="lazy" />
                      ) : (
                        <span className="product-card__placeholder">No image</span>
                      )}
                      <span className="featured__badge">Featured</span>
                    </div>
                    <div className="featured__body">
                      <h3>{p.title}</h3>
                      <p className="featured__price">{formatPrice(p.price)}</p>
                      <p className="featured__meta">
                        {p.city}
                        {Number(p.seller?.sellerRatingAvg) > 0 && (
                          <> · ★ {Number(p.seller.sellerRatingAvg).toFixed(1)}</>
                        )}
                      </p>
                      {p.deliveryEligible && (
                        <p className="featured__delivery">🚚 Delivery available</p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

function AuthForm({ title, submitLabel, onSubmit }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const isRegister = title === 'Create account';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onSubmit(email, password, displayName);
      navigate('/app/dashboard');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>{title}</h1>
        <p className="auth-subtitle">{isRegister ? 'Join FERILO — buy and sell with trust.' : 'Welcome back to FERILO.'}</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <form onSubmit={handleSubmit} className="auth-form">
          {isRegister && (
            <label>
              Display name
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={2} />
            </label>
          )}
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={isRegister ? 'new-password' : 'current-password'} />
          </label>
          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? 'Please wait…' : submitLabel}
          </button>
        </form>
        <p className="auth-switch">
          {isRegister ? (
            <>Already have an account? <Link to="/login">Login</Link></>
          ) : (
            <>New here? <Link to="/register">Create account</Link></>
          )}
        </p>
      </div>
    </div>
  );
}

function LoginPage() {
  const { login, user } = useAuth();
  if (user) return <Navigate to="/app/dashboard" replace />;
  return <AuthForm title="Login" submitLabel="Login" onSubmit={(email, password) => login(email, password)} />;
}

function RegisterPage() {
  const { register, user } = useAuth();
  if (user) return <Navigate to="/app/dashboard" replace />;
  return (
    <AuthForm
      title="Create account"
      submitLabel="Sign up"
      onSubmit={(email, password, displayName) => register(email, password, displayName)}
    />
  );
}

function DashboardPage() {
  const { user } = useAuth();
  return (
    <div className="dashboard">
      <div className="container">
        <h1>Hello, {user.displayName || user.email}</h1>
        <p className="dashboard__meta">
          Role: <strong>{user.role}</strong> · Verification:{' '}
          <span className={`badge badge--${user.verificationStatus?.toLowerCase()}`}>
            {user.verificationStatus}
          </span>
        </p>
        <div className="dashboard__cards">

          {user.role === 'ADMIN' && (
            <>
              <Link to="/admin" className="trust__card dashboard__link">
                <h2>Admin Dashboard</h2>
                <p>Overview of users, listings, orders and reports.</p>
              </Link>
              <Link to="/admin/verifications" className="trust__card dashboard__link">
                <h2>Admin: Verifications</h2>
                <p>Review pending identity requests.</p>
              </Link>
              <Link to="/admin/reports" className="trust__card dashboard__link">
                <h2>Admin: Reports</h2>
                <p>Moderate community reports.</p>
              </Link>
            </>
          )}
          
          <Link to="/app/listings" className="trust__card dashboard__link">
            <h2>My Listings</h2>
            <p>Create and manage your products.</p>
          </Link>
          <Link to="/app/favorites" className="trust__card dashboard__link">
            <h2>Saved Listings</h2>
            <p>View items you have saved for later.</p>
          </Link>
          <Link to="/app/offers" className="trust__card dashboard__link">
            <h2>My Offers</h2>
            <p>Track offers you sent and received.</p>
          </Link>
          <Link to="/app/messages" className="trust__card dashboard__link">
            <h2>Messages</h2>
            <p>Chat with buyers and sellers.</p>
          </Link>
          <Link to="/app/orders" className="trust__card dashboard__link">
            <h2>Orders</h2>
            <p>Track purchases and sales.</p>
          </Link>
          <Link to="/app/notifications" className="trust__card dashboard__link">
            <h2>Notifications</h2>
            <p>Offers, orders, and review updates.</p>
          </Link>
          <Link to="/app/reports" className="trust__card dashboard__link">
            <h2>My Reports</h2>
            <p>Track reports you submitted.</p>
          </Link>
          <Link to="/app/listings/new" className="trust__card dashboard__link">
            <h2>Post an Ad</h2>
            <p>Sell something — verification required.</p>
          </Link>
          <Link to="/app/profile" className="trust__card dashboard__link">
            <h2>Edit Profile</h2>
            <p>Update your name, city, and bio.</p>
          </Link>
          <Link to="/app/verification" className="trust__card dashboard__link">
            <h2>Verify Identity</h2>
            <p>Required to publish listings.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}

function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [form, setForm] = useState({
    displayName: user.displayName || '',
    phone: user.phone || '',
    city: user.city || '',
    district: user.district || '',
    bio: user.bio || '',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await updateProfile(form);
      await refreshUser();
      setMessage('Profile updated successfully.');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard">
      <div className="container narrow">
        <h1>My Profile</h1>
        {message && <p className="auth-success">{message}</p>}
        {error && <p className="auth-error">{error}</p>}
        <form className="auth-form profile-form" onSubmit={handleSubmit}>
          <label>Display name<input name="displayName" value={form.displayName} onChange={handleChange} required /></label>
          <label>Phone<input name="phone" value={form.phone} onChange={handleChange} placeholder="+977 9800000000" /></label>
          <label>City<input name="city" value={form.city} onChange={handleChange} placeholder="Bhairahawa" /></label>
          <label>District<input name="district" value={form.district} onChange={handleChange} placeholder="Rupandehi" /></label>
          <label>Bio<textarea name="bio" value={form.bio} onChange={handleChange} rows={4} maxLength={500} /></label>
          <button type="submit" className="auth-submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
        </form>
      </div>
    </div>
  );
}

function VerificationPage() {
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState(null);
  const [documentType, setDocumentType] = useState('CITIZENSHIP');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchVerificationStatus().then(setStatus).catch(() => {});
  }, []);

  const canSubmit = !status?.latest || ['REJECTED', 'RESUBMISSION_REQUIRED'].includes(status?.latest?.status)
    || (user.verificationStatus === 'UNVERIFIED' && !status?.latest);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');
    const formData = new FormData(e.target);
    formData.set('documentType', documentType);
    try {
      const result = await submitVerification(formData);
      setStatus(result);
      await refreshUser();
      setMessage('Verification submitted. An admin will review your documents.');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dashboard">
      <div className="container narrow">
        <h1>Identity Verification</h1>
        <p className="auth-subtitle">
          Upload demo/test documents for portfolio review. Documents are stored privately and never shown to other users.
        </p>
        <p className="dashboard__meta">
          Status:{' '}
          <span className={`badge badge--${user.verificationStatus?.toLowerCase()}`}>
            {user.verificationStatus}
          </span>
        </p>
        {status?.latest?.rejectionReason && (
          <p className="auth-error">Previous rejection: {status.latest.rejectionReason}</p>
        )}
        {message && <p className="auth-success">{message}</p>}
        {error && <p className="auth-error">{error}</p>}
        {user.verificationStatus === 'VERIFIED' ? (
          <p className="auth-success">Your identity is verified. You can publish listings (Phase 7).</p>
        ) : canSubmit ? (
          <form className="auth-form profile-form" onSubmit={handleSubmit}>
            <label>
              Document type
              <select value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
                <option value="CITIZENSHIP">Citizenship (demo)</option>
                <option value="PASSPORT">Passport (demo)</option>
                <option value="DRIVING_LICENSE">Driving license (demo)</option>
              </select>
            </label>
            <label>Front side (required)<input type="file" name="front" accept="image/jpeg,image/png,application/pdf" required /></label>
            <label>Back side (optional)<input type="file" name="back" accept="image/jpeg,image/png,application/pdf" /></label>
            <label>Selfie (optional)<input type="file" name="selfie" accept="image/jpeg,image/png" /></label>
            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? 'Uploading…' : 'Submit for verification'}
            </button>
          </form>
        ) : (
          <p className="auth-subtitle">Your verification is under review. Please check back later.</p>
        )}
      </div>
    </div>
  );
}

function AdminVerificationsPage() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    fetchAdminVerifications()
      .then(setQueue)
      .catch(() => setError('Failed to load verification queue.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (id) => {
    await approveVerification(id);
    load();
  };

  const handleReject = async (id) => {
    const reason = window.prompt('Rejection reason (min 5 characters):');
    if (!reason || reason.length < 5) return;
    await rejectVerification(id, reason);
    load();
  };

  return (
    <div className="dashboard">
      <div className="container">
        <AdminNav />
        <h1>Verification Queue</h1>
        {error && <p className="auth-error">{error}</p>}
        {loading ? (
          <p className="auth-loading">Loading…</p>
        ) : queue.length === 0 ? (
          <p className="auth-subtitle">No pending verifications.</p>
        ) : (
          <ul className="admin-list">
            {queue.map((item) => (
              <li key={item.id} className="admin-list__item">
                <div>
                  <strong>{item.display_name || item.email}</strong>
                  <p>{item.document_type} · {item.document_count} file(s) · {new Date(item.submitted_at).toLocaleString()}</p>
                </div>
                <div className="admin-list__actions">
                  <button type="button" className="header__btn header__btn--primary" onClick={() => handleApprove(item.id)}>Approve</button>
                  <button type="button" className="header__btn header__btn--ghost" onClick={() => handleReject(item.id)}>Reject</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const REPORT_CATEGORIES = [
  { value: 'SPAM', label: 'Spam' },
  { value: 'SCAM', label: 'Scam / fraud' },
  { value: 'INAPPROPRIATE', label: 'Inappropriate content' },
  { value: 'COUNTERFEIT', label: 'Counterfeit item' },
  { value: 'PROHIBITED_ITEM', label: 'Prohibited item' },
  { value: 'HARASSMENT', label: 'Harassment' },
  { value: 'MISLEADING', label: 'Misleading listing' },
  { value: 'OTHER', label: 'Other' },
];

function ReportPanel({ targetType, targetId, label = 'Report', hideForUserId }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('SPAM');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  if (user && hideForUserId && user.id === hideForUserId) return null;

  if (!user) {
    return <p className="auth-subtitle"><Link to="/login">Log in</Link> to report this.</p>;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await createReport({ targetType, targetId, category, description });
      setSuccess('Report submitted. Our team will review it.');
      setDescription('');
      setOpen(false);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not submit report.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="report-panel">
      {!open ? (
        <button type="button" className="header__btn header__btn--ghost" onClick={() => setOpen(true)}>
          {label}
        </button>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          <h3>Report {targetType.toLowerCase()}</h3>
          <label>
            Reason
            <select value={category} onChange={(e) => setCategory(e.target.value)} required>
              {REPORT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <label>
            Details
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} minLength={10} maxLength={2000} required placeholder="What happened? Include enough detail for review." />
          </label>
          {error && <p className="auth-error form-feedback">{error}</p>}
          <div className="offer-actions">
            <button type="submit" className="header__btn header__btn--primary" disabled={busy}>{busy ? 'Sending…' : 'Submit report'}</button>
            <button type="button" className="header__btn header__btn--ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
      {success && <p className="auth-success form-feedback">{success}</p>}
    </div>
  );
}

function MyReportsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMyReports()
      .then(setItems)
      .catch(() => setError('Failed to load reports.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="dashboard">
      <div className="container">
        <h1>My Reports</h1>
        <p className="dashboard__meta">Reports you submitted for moderation.</p>
        {error && <p className="auth-error">{error}</p>}
        {loading ? <p className="auth-loading">Loading…</p> : items.length === 0 ? (
          <p className="auth-subtitle">You have not submitted any reports yet.</p>
        ) : (
          <ul className="admin-list">
            {items.map((r) => (
              <li key={r.id} className="admin-list__item">
                <div>
                  <strong>{r.category.replace(/_/g, ' ')}</strong>
                  <p>{r.targetType} · {r.status} · {new Date(r.createdAt).toLocaleString()}</p>
                  <p>{r.description}</p>
                  {r.adminNotes && <p className="auth-subtitle">Admin note: {r.adminNotes}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AdminNav() {
  const { user } = useAuth();
  const [photo, setPhoto] = useState(() => {
    try {
      return localStorage.getItem('ferilo_admin_photo') || null;
    } catch {
      return null;
    }
  });

  const displayName = user?.displayName || user?.email || 'Admin';
  const initial = displayName.trim().charAt(0).toUpperCase() || 'A';

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setPhoto(dataUrl);
      try {
        localStorage.setItem('ferilo_admin_photo', dataUrl);
      } catch {
        /* ignore storage quota limits */
      }
    };
    reader.readAsDataURL(file);
  };

  const links = [
    { to: '/admin', label: 'Overview' },
    { to: '/admin/verifications', label: 'Verifications' },
    { to: '/admin/reports', label: 'Reports' },
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/listings', label: 'Listings' },
    { to: '/admin/orders', label: 'Orders' },
  ];

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {/* Circular Admin Profile Card */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '16px',
          background: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border-color, #e5e7eb)',
          borderRadius: '12px',
          marginBottom: '1rem',
        }}
      >
        {/* Circle avatar container */}
        <div
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            overflow: 'hidden',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '32px',
            fontWeight: '700',
            boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
            border: '2px solid #e5e7eb',
          }}
        >
          {photo ? (
            <img
              src={photo}
              alt={displayName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span>{initial}</span>
          )}
        </div>

        {/* Name under circle */}
        <div style={{ textAlign: 'center' }}>
          <strong style={{ fontSize: '1rem', display: 'block' }}>{displayName}</strong>
          <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Administrator</span>
        </div>

        {/* Upload Button */}
        <label
          style={{
            cursor: 'pointer',
            fontSize: '0.8rem',
            padding: '4px 10px',
            backgroundColor: '#f3f4f6',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            color: '#374151',
          }}
        >
          Change photo
          <input
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {/* Navigation tabs */}
      <nav className="offers-tabs admin-nav" aria-label="Admin">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="offers-tabs__btn">{l.label}</Link>
        ))}
      </nav>
    </div>
  );
}

function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAdminStats()
      .then(setStats)
      .catch(() => setError('Failed to load admin stats.'));
  }, []);

  return (
    <div className="dashboard">
      <div className="container">
        <AdminNav />
        <h1>Admin Dashboard</h1>
        {error && <p className="auth-error">{error}</p>}
        {!stats ? <p className="auth-loading">Loading…</p> : (
          <div className="dashboard__cards">
            <div className="trust__card"><h2>Users</h2><p>{stats.users.active} active · {stats.users.verified} verified · {stats.users.suspended} suspended</p></div>
            <div className="trust__card"><h2>Listings</h2><p>{stats.products.active} active · {stats.products.removed} removed</p></div>
            <div className="trust__card"><h2>Orders</h2><p>{stats.orders.pending} pending · {stats.orders.completed} completed</p></div>
            <div className="trust__card"><h2>Moderation</h2><p>{stats.reports.open} open reports · {stats.verifications.pending} verifications</p></div>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminReportsPage() {
  const [status, setStatus] = useState('OPEN');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchAdminReports(status)
      .then(setItems)
      .catch(() => setError('Failed to load reports.'))
      .finally(() => setLoading(false));
  }, [status]);

  const act = async (id, nextStatus) => {
    const adminNotes = window.prompt('Admin notes (optional):') || '';
    try {
      await updateAdminReport(id, { status: nextStatus, adminNotes: adminNotes || undefined });
      setLoading(true);
      fetchAdminReports(status)
        .then(setItems)
        .catch(() => setError('Failed to load reports.'))
        .finally(() => setLoading(false));
    } catch (err) {
      window.alert(err.response?.data?.error?.message || 'Update failed.');
    }
  };

  return (
    <div className="dashboard">
      <div className="container">
        <AdminNav />
        <h1>Reports</h1>
        <div className="offers-tabs">
          {['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED', 'ALL'].map((s) => (
            <button key={s} type="button" className={status === s ? 'offers-tabs__btn offers-tabs__btn--active' : 'offers-tabs__btn'} onClick={() => setStatus(s)}>{s.replace('_', ' ')}</button>
          ))}
        </div>
        {error && <p className="auth-error">{error}</p>}
        {loading ? <p className="auth-loading">Loading…</p> : items.length === 0 ? (
          <p className="auth-subtitle">No reports in this view.</p>
        ) : (
          <ul className="admin-list">
            {items.map((r) => (
              <li key={r.id} className="admin-list__item">
                <div>
                  <strong>{r.category}</strong> · {r.targetType}
                  <p>From {r.reporterName || r.reporterEmail} · {r.status} · {new Date(r.createdAt).toLocaleString()}</p>
                  <p>{r.description}</p>
                  <p className="auth-subtitle">Target: {r.targetId}</p>
                </div>
                <div className="admin-list__actions">
                  {r.status === 'OPEN' && <button type="button" className="header__btn header__btn--ghost" onClick={() => act(r.id, 'UNDER_REVIEW')}>Review</button>}
                  {['OPEN', 'UNDER_REVIEW'].includes(r.status) && (
                    <>
                      <button type="button" className="header__btn header__btn--primary" onClick={() => act(r.id, 'RESOLVED')}>Resolve</button>
                      <button type="button" className="header__btn header__btn--ghost" onClick={() => act(r.id, 'DISMISSED')}>Dismiss</button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AdminUsersPage() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchAdminUsers('')
      .then(setItems)
      .catch(() => setError('Failed to load users.'))
      .finally(() => setLoading(false));
  }, []);

  const load = (query = q) => {
    setLoading(true);
    fetchAdminUsers(query)
      .then(setItems)
      .catch(() => setError('Failed to load users.'))
      .finally(() => setLoading(false));
  };

  const toggle = async (user) => {
    const next = user.accountStatus === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    const reason = next === 'SUSPENDED' ? (window.prompt('Suspension reason:') || '') : '';
    if (next === 'SUSPENDED' && reason.length < 3) return;
    try {
      await updateAdminUserStatus(user.id, { accountStatus: next, reason: reason || undefined });
      load();
    } catch (err) {
      window.alert(err.response?.data?.error?.message || 'Update failed.');
    }
  };

  return (
    <div className="dashboard">
      <div className="container">
        <AdminNav />
        <h1>Users</h1>
        <form className="browse-filters__form" style={{ maxWidth: 420, marginBottom: '1rem' }} onSubmit={(e) => { e.preventDefault(); load(q); }}>
          <label>Search<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Email or name" /></label>
          <button type="submit" className="header__btn header__btn--primary">Search</button>
        </form>
        {error && <p className="auth-error">{error}</p>}
        {loading ? <p className="auth-loading">Loading…</p> : (
          <ul className="admin-list">
            {items.map((u) => (
              <li key={u.id} className="admin-list__item">
                <div>
                  <strong>{u.displayName || u.email}</strong>
                  <p>{u.email} · {u.role} · {u.verificationStatus} · {u.accountStatus}</p>
                  <p>{u.city || '—'} · sales {u.totalSales ?? 0} · purchases {u.totalPurchases ?? 0}</p>
                </div>
                {u.role !== 'ADMIN' && (
                  <div className="admin-list__actions">
                    <button type="button" className="header__btn header__btn--ghost" onClick={() => toggle(u)}>
                      {u.accountStatus === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AdminListingsPage() {
  const [status, setStatus] = useState('ACTIVE');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchAdminProducts(status)
      .then(setItems)
      .catch(() => setError('Failed to load listings.'))
      .finally(() => setLoading(false));
  }, [status]);

  const remove = async (id) => {
    const reason = window.prompt('Removal reason (min 3 characters):');
    if (!reason || reason.length < 3) return;
    try {
      await updateAdminProductStatus(id, { status: 'REMOVED', reason });
      setLoading(true);
      fetchAdminProducts(status)
        .then(setItems)
        .catch(() => setError('Failed to load listings.'))
        .finally(() => setLoading(false));
    } catch (err) {
      window.alert(err.response?.data?.error?.message || 'Update failed.');
    }
  };

  return (
    <div className="dashboard">
      <div className="container">
        <AdminNav />
        <h1>Listings</h1>
        <div className="offers-tabs">
          {['ACTIVE', 'REMOVED', 'REJECTED', 'ALL'].map((s) => (
            <button key={s} type="button" className={status === s ? 'offers-tabs__btn offers-tabs__btn--active' : 'offers-tabs__btn'} onClick={() => setStatus(s)}>{s}</button>
          ))}
        </div>
        {error && <p className="auth-error">{error}</p>}
        {loading ? <p className="auth-loading">Loading…</p> : items.length === 0 ? (
          <p className="auth-subtitle">No listings.</p>
        ) : (
          <ul className="admin-list">
            {items.map((p) => (
              <li key={p.id} className="admin-list__item">
                <div>
                  <Link to={`/products/${p.id}`} className="offer-card__title">{p.title}</Link>
                  <p>{formatPrice(p.price)} · {p.status} · {p.city} · {p.sellerName || p.sellerEmail}</p>
                </div>
                {p.status !== 'REMOVED' && (
                  <div className="admin-list__actions">
                    <button type="button" className="header__btn header__btn--ghost" onClick={() => remove(p.id)}>Remove</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AdminOrdersPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAdminOrders()
      .then(setItems)
      .catch(() => setError('Failed to load orders.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="dashboard">
      <div className="container">
        <AdminNav />
        <h1>Orders</h1>
        {error && <p className="auth-error">{error}</p>}
        {loading ? <p className="auth-loading">Loading…</p> : items.length === 0 ? (
          <p className="auth-subtitle">No orders yet.</p>
        ) : (
          <ul className="admin-list">
            {items.map((o) => (
              <li key={o.id} className="admin-list__item">
                <div>
                  <strong>{o.orderNumber}</strong>
                  <p>{o.productTitle} · {o.status} · {o.fulfillmentType} · {formatPrice(o.totalAmount)}</p>
                  <p>{o.buyerName} → {o.sellerName} · {new Date(o.createdAt).toLocaleString()}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StaticPage({ title, children, wide = false }) {
  return (
    <div className="dashboard">
      <div className={`container ${wide ? 'static-page' : 'narrow'}`}>
        <h1>{title}</h1>
        <div className="static-page__body">{children}</div>
      </div>
    </div>
  );
}

function AboutPage() {
  return (
    <StaticPage title="About Us" wide>
      <p className="static-page__lead">
        FERILO is an open-source peer-to-peer marketplace demo for second-hand goods in Nepal.
        Members can complete optional in-app identity verification (admin-reviewed documents).
        That helps build trust on the platform — it is <strong>not</strong> a government license or official certification.
        Our mission is simple: <strong>Buy. Sell. Give it another life.</strong>
      </p>

      <h2>Who we are</h2>
      <p>
        We started FERILO to make local buying and selling safer and easier across the
        Lumbini region — especially Rupandehi and Kapilvastu. Too many great items sit
        unused while buyers struggle to find trusted sellers nearby. FERILO connects
        neighbours through identity-checked accounts, clear listings, and moderated trades.
      </p>

      <h2>What we offer</h2>
      <ul>
        <li><strong>Identity-checked members</strong> — optional document review by admins (platform trust feature, not a government ID scheme).</li>
        <li><strong>Local focus</strong> — browse by city across Bhairahawa, Butwal, Lumbini, Tilottama, Taulihawa, and more.</li>
        <li><strong>Offers &amp; messaging</strong> — negotiate fairly and chat before you commit.</li>
        <li><strong>Meetup or delivery</strong> — arrange a public meetup or request a delivery quote.</li>
        <li><strong>Reviews &amp; reports</strong> — reputation and reporting tools keep the community honest.</li>
      </ul>

      <h2>Where we serve</h2>
      <p>
        We currently focus on <strong>Rupandehi</strong> and <strong>Kapilvastu</strong>
        (Lumbini Province), including:
      </p>
      <ul>
        <li>Bhairahawa, Butwal, Lumbini, Tilottama, Sainamaina, Devdaha, Manigram</li>
        <li>Taulihawa, Krishnanagar, Kapilvastu, Bahadurganj</li>
      </ul>

      <h2>Our values</h2>
      <ul>
        <li><strong>Trust first</strong> — verification, moderation, and clear rules.</li>
        <li><strong>Reuse over waste</strong> — every sale keeps an item in use longer.</li>
        <li><strong>Local community</strong> — support buyers and sellers near you.</li>
        <li><strong>Fair dealing</strong> — honest photos, honest prices, honest handovers.</li>
      </ul>

      <h2>Need help?</h2>
      <p>
        Visit our <Link to="/help">Help Center</Link>, read{' '}
        <Link to="/help/safety">Safety Tips</Link>, or{' '}
        <Link to="/contact">Contact Us</Link> if you need support.
      </p>
    </StaticPage>
  );
}

function ContactPage() {
  return (
    <StaticPage title="Contact Us" wide>
      <p className="static-page__lead">
        Questions about your account, a listing, an order, or verification?
        We are here to help.
      </p>

      <div className="contact-cards">
        <div className="contact-card">
          <h2>Email</h2>
          <p>
            <a href="mailto:support@ferilo.local">support@ferilo.local</a>
          </p>
          <p className="contact-card__meta">Best for account, order, and listing issues.</p>
          <p className="contact-card__meta">Typical reply within 1–2 business days.</p>
        </div>
        <div className="contact-card">
          <h2>Phone &amp; WhatsApp</h2>
          <p>
            <a href="tel:+977715500123">+977 71-5500123</a>
          </p>
          <p>
            <a href="https://wa.me/9779800000000" target="_blank" rel="noreferrer">
              WhatsApp: +977 980-0000000
            </a>
          </p>
          <p className="contact-card__meta">Sun–Fri, 10:00–17:00 NPT</p>
        </div>
        <div className="contact-card">
          <h2>Office</h2>
          <p>
            FERILO Support Desk<br />
            Traffic Chowk area, Butwal<br />
            Rupandehi, Lumbini Province<br />
            Nepal
          </p>
          <p className="contact-card__meta">Visits by appointment only.</p>
        </div>
      </div>

      <h2>Before you write</h2>
      <ul>
        <li>Include your registered email and order or listing ID when relevant.</li>
        <li>For safety concerns or scams, use <Link to="/app/reports">My Reports</Link> (after login) or email us with screenshots.</li>
        <li>Quick answers: <Link to="/help">Help Center</Link>, <Link to="/help/how-to-buy">How to Buy</Link>, <Link to="/help/how-to-sell">How to Sell</Link>.</li>
      </ul>

      <h2>Business &amp; partnerships</h2>
      <p>
        For press, partnerships, or delivery partners, email{' '}
        <a href="mailto:hello@ferilo.local">hello@ferilo.local</a>.
      </p>
    </StaticPage>
  );
}

function VerifiedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="container auth-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'ADMIN' && user.verificationStatus !== 'VERIFIED') {
    return <Navigate to="/app/verification" replace />;
  }
  return children;
}

function ProductGrid({ products }) {
  if (!products.length) {
    return <p className="auth-subtitle">No listings match your filters. Try adjusting your search.</p>;
  }

  return (
    <ul className="product-grid">
      {products.map((p) => (
        <li key={p.id} className="product-grid__item">
          <Link to={`/products/${p.id}`} className="product-card">
            <div className="product-card__img">
              {p.images?.[0]?.url ? (
                <img src={p.images[0].url} alt="" loading="lazy" />
              ) : (
                <span className="product-card__placeholder">No image</span>
              )}
              <FavoriteButton productId={p.id} sellerId={p.seller?.id} className="product-card__favorite" />
            </div>
            <div className="product-card__body">
              <h2>{p.title}</h2>
              <p className="product-card__price">{formatPrice(p.price)}</p>
              <p className="product-card__meta">{p.condition.replace('_', ' ').toLowerCase()} · {p.city}</p>
              {p.seller?.verificationStatus === 'VERIFIED' && (
                <span className="badge badge--verified">Verified seller</span>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ProductListingPage({ fixedCategoryId, pageTitle, categoryIcon }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { area } = useArea();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 24, total: 0 });
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(() => filtersFromSearchParams(searchParams, fixedCategoryId));

  const activeFilters = useMemo(
    () => filtersFromSearchParams(searchParams, fixedCategoryId),
    [searchParams, fixedCategoryId],
  );

  const queryParams = useMemo(() => {
    const filters = { ...activeFilters };
    if (!filters.city && area.city) filters.city = area.city;
    if (!filters.district && area.district) filters.district = area.district;
    return buildProductQuery(filters);
  }, [activeFilters, area.city, area.district]);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories(FALLBACK_CATEGORIES));
  }, []);

  useEffect(() => {
    setDraft(filtersFromSearchParams(searchParams, fixedCategoryId));
  }, [searchParams, fixedCategoryId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchProducts(queryParams)
      .then((result) => {
        if (cancelled) return;
        setProducts(result.products);
        setMeta(result.meta || { page: 1, limit: 24, total: result.products.length });
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [queryParams]);

  const handleDraftChange = (e) => {
    const { name, value, type, checked } = e.target;
    setDraft((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const applyFilters = (e) => {
    e.preventDefault();
    setSearchParams(searchParamsFromFilters({ ...draft, page: '1' }));
  };

  const clearFilters = () => {
    const cleared = {
      q: '',
      categoryId: fixedCategoryId ? String(fixedCategoryId) : '',
      city: '',
      district: '',
      condition: '',
      minPrice: '',
      maxPrice: '',
      sort: 'newest',
      verifiedOnly: false,
      page: '1',
    };
    setDraft(cleared);
    setSearchParams(searchParamsFromFilters(cleared));
  };

  const handleSortChange = (e) => {
    const sort = e.target.value;
    const next = { ...activeFilters, sort, page: '1' };
    setDraft((prev) => ({ ...prev, sort }));
    setSearchParams(searchParamsFromFilters(next));
  };

  const goToPage = (page) => {
    setSearchParams(searchParamsFromFilters({ ...activeFilters, page: String(page) }));
  };

  const totalPages = Math.max(1, Math.ceil(meta.total / meta.limit));
  const topLevelCategories = categories.filter((c) => !c.parent_id);

  return (
    <div className="dashboard">
      <div className="container">
        <div className="browse-head">
          <h1>
            {categoryIcon && <span className="browse-head__icon" aria-hidden="true">{categoryIcon}</span>}
            {pageTitle || 'Browse listings'}
          </h1>
          {!loading && (
            <>
              <DataSourceBadge />
              <p className="browse-head__count">
                {meta.total} {meta.total === 1 ? 'listing' : 'listings'} found
              </p>
            </>
          )}
        </div>

        <div className="browse-layout">
          <aside className="browse-filters">
            <h2>Filters</h2>
            <form className="browse-filters__form" onSubmit={applyFilters}>
              <label>
                Search
                <input name="q" type="search" value={draft.q} onChange={handleDraftChange} placeholder="Title, brand…" />
              </label>
              {!fixedCategoryId && (
                <label>
                  Category
                  <select name="categoryId" value={draft.categoryId} onChange={handleDraftChange}>
                    <option value="">All categories</option>
                    {topLevelCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                City
                <input name="city" value={draft.city} onChange={handleDraftChange} placeholder="e.g. Bhairahawa" />
              </label>
              <label>
                District
                <input name="district" value={draft.district} onChange={handleDraftChange} placeholder="e.g. Rupandehi" />
              </label>
              <label>
                Condition
                <select name="condition" value={draft.condition} onChange={handleDraftChange}>
                  <option value="">Any condition</option>
                  {CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </label>
              <div className="browse-filters__row">
                <label>
                  Min price
                  <input name="minPrice" type="number" min="0" value={draft.minPrice} onChange={handleDraftChange} placeholder="0" />
                </label>
                <label>
                  Max price
                  <input name="maxPrice" type="number" min="0" value={draft.maxPrice} onChange={handleDraftChange} placeholder="Any" />
                </label>
              </div>
              <label className="checkbox-label">
                <input name="verifiedOnly" type="checkbox" checked={draft.verifiedOnly} onChange={handleDraftChange} />
                Verified sellers only
              </label>
              <div className="browse-filters__actions">
                <button type="submit" className="header__btn header__btn--primary">Apply filters</button>
                <button type="button" className="header__btn header__btn--ghost" onClick={clearFilters}>Clear</button>
              </div>
            </form>
          </aside>

          <section className="browse-results">
            <div className="browse-toolbar">
              <label className="browse-toolbar__sort">
                Sort by
                <select value={activeFilters.sort} onChange={handleSortChange}>
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {loading ? (
              <p className="auth-loading">Loading…</p>
            ) : (
              <>
                <ProductGrid products={products} />
                {meta.total > meta.limit && (
                  <nav className="browse-pagination" aria-label="Pagination">
                    <button
                      type="button"
                      className="header__btn header__btn--ghost"
                      disabled={meta.page <= 1}
                      onClick={() => goToPage(meta.page - 1)}
                    >
                      Previous
                    </button>
                    <span>Page {meta.page} of {totalPages}</span>
                    <button
                      type="button"
                      className="header__btn header__btn--ghost"
                      disabled={meta.page >= totalPages}
                      onClick={() => goToPage(meta.page + 1)}
                    >
                      Next
                    </button>
                  </nav>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function BrowsePage() {
  return <ProductListingPage />;
}

function CategoryPage() {
  const { slug } = useParams();
  const [category, setCategory] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setCategory(null);
    setError('');
    fetchCategoryBySlug(slug)
      .then(setCategory)
      .catch(() => setError('Category not found.'));
  }, [slug]);

  if (error) return <div className="container auth-loading">{error}</div>;
  if (!category) return <div className="container auth-loading">Loading…</div>;

  return (
    <ProductListingPage
      fixedCategoryId={category.id}
      pageTitle={category.name}
      categoryIcon={category.icon}
    />
  );
}

function MakeOfferPanel({ product }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!user) {
    return (
      <div className="offer-panel">
        <h2>Make an offer</h2>
        <p className="auth-subtitle"><Link to="/login">Log in</Link> to negotiate on this listing.</p>
      </div>
    );
  }

  if (user.id === product.seller?.id) return null;

  if (!product.isNegotiable) {
    return (
      <div className="offer-panel">
        <h2>Fixed price</h2>
        <p className="auth-subtitle">This listing does not accept offers.</p>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      await createOffer({
        productId: product.id,
        amount: Number(amount),
        message: message.trim() || undefined,
      });
      setSuccess('Offer sent! The seller will respond in your Offers page.');
      setAmount('');
      setMessage('');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to send offer.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="offer-panel">
      <h2>Make an offer</h2>
      <p className="auth-subtitle">Listed at {formatPrice(product.price)} · negotiable</p>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Your offer (NPR)
          <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label>
          Message (optional)
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={1000} placeholder="Add a note for the seller…" />
        </label>
        {success && <p className="auth-success form-feedback">{success}</p>}
        {error && <p className="auth-error form-feedback">{error}</p>}
        <button type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? 'Sending…' : 'Send offer'}
        </button>
        <button type="button" className="header__btn header__btn--ghost" onClick={() => navigate('/app/offers')}>
          View my offers
        </button>
      </form>
    </div>
  );
}

function OfferActions({ offer, role, onUpdate }) {
  const { user } = useAuth();
  const [counterAmount, setCounterAmount] = useState('');
  const [showCounter, setShowCounter] = useState(false);
  const [busy, setBusy] = useState(false);

  if (offer.status !== 'PENDING') return null;

  const isBuyer = user?.id === offer.buyerId;
  const isSeller = user?.id === offer.sellerId;
  const sellerInitial = isSeller && !offer.parentOfferId;
  const buyerCounter = isBuyer && offer.parentOfferId;

  const run = async (action) => {
    setBusy(true);
    try {
      await action();
      onUpdate();
    } catch (err) {
      window.alert(err.response?.data?.error?.message || 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleCounter = async (e) => {
    e.preventDefault();
    if (!counterAmount) return;
    await run(() => counterOffer(offer.id, { amount: Number(counterAmount) }));
    setShowCounter(false);
    setCounterAmount('');
  };

  return (
    <div className="offer-actions">
      {role === 'buyer' && isBuyer && !offer.parentOfferId && (
        <button type="button" className="header__btn header__btn--ghost" disabled={busy} onClick={() => run(() => cancelOffer(offer.id))}>
          Cancel
        </button>
      )}
      {sellerInitial && (
        <>
          <button type="button" className="header__btn header__btn--primary" disabled={busy} onClick={() => run(() => acceptOffer(offer.id))}>Accept</button>
          <button type="button" className="header__btn header__btn--ghost" disabled={busy} onClick={() => run(() => rejectOffer(offer.id))}>Reject</button>
          <button type="button" className="header__btn header__btn--ghost" disabled={busy} onClick={() => setShowCounter(!showCounter)}>Counter</button>
        </>
      )}
      {buyerCounter && (
        <>
          <button type="button" className="header__btn header__btn--primary" disabled={busy} onClick={() => run(() => acceptOffer(offer.id))}>Accept counter</button>
          <button type="button" className="header__btn header__btn--ghost" disabled={busy} onClick={() => run(() => rejectOffer(offer.id))}>Reject</button>
          <button type="button" className="header__btn header__btn--ghost" disabled={busy} onClick={() => setShowCounter(!showCounter)}>Counter</button>
        </>
      )}
      {showCounter && (sellerInitial || buyerCounter) && (
        <form className="offer-actions__counter" onSubmit={handleCounter}>
          <input type="number" min="1" placeholder="Counter amount" value={counterAmount} onChange={(e) => setCounterAmount(e.target.value)} required />
          <button type="submit" className="header__btn header__btn--primary" disabled={busy}>Send counter</button>
        </form>
      )}
    </div>
  );
}

function OfferCard({ offer, role, onUpdate }) {
  const navigate = useNavigate();

  const handleMessageBuyer = async () => {
    try {
      const conversation = await startConversation(offer.productId, offer.buyerId);
      navigate(`/app/messages/${conversation.id}`);
    } catch (err) {
      window.alert(err.response?.data?.error?.message || 'Could not start conversation.');
    }
  };

  return (
    <li className="offer-card">
      <div className="offer-card__main">
        <div>
          <Link to={`/products/${offer.productId}`} className="offer-card__title">{offer.productTitle}</Link>
          <p className="offer-card__meta">
            {role === 'buyer' ? `Seller: ${offer.sellerName || 'Unknown'}` : `Buyer: ${offer.buyerName || 'Unknown'}`}
            {' · '}Listed {formatPrice(offer.productPrice)}
          </p>
          {offer.message && <p className="offer-card__message">&ldquo;{offer.message}&rdquo;</p>}
          <p className="offer-card__date">{new Date(offer.createdAt).toLocaleString()}</p>
          {role === 'buyer' && offer.status === 'ACCEPTED' && (
            <button
              type="button"
              className="header__btn header__btn--primary offer-card__message-btn"
              onClick={() => navigate(`/products/${offer.productId}?offerId=${offer.id}`)}
            >
              Place order
            </button>
          )}
          {role === 'seller' && (
            <button type="button" className="header__btn header__btn--ghost offer-card__message-btn" onClick={handleMessageBuyer}>
              Message buyer
            </button>
          )}
        </div>
        <div className="offer-card__side">
          <p className="offer-card__amount">{formatPrice(offer.amount)}</p>
          <span className={`badge badge--offer badge--offer-${offer.status.toLowerCase()}`}>
            {OFFER_STATUS_LABELS[offer.status] || offer.status}
          </span>
        </div>
      </div>
      <OfferActions offer={offer} role={role} onUpdate={onUpdate} />
    </li>
  );
}

function OffersPage() {
  const [tab, setTab] = useState('mine');
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    const fetcher = tab === 'mine' ? fetchMyOffers : fetchIncomingOffers;
    fetcher()
      .then(setOffers)
      .catch(() => setError('Failed to load offers.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    setError('');
    const fetcher = tab === 'mine' ? fetchMyOffers : fetchIncomingOffers;
    fetcher()
      .then(setOffers)
      .catch(() => setError('Failed to load offers.'))
      .finally(() => setLoading(false));
  }, [tab]);

  return (
    <div className="dashboard">
      <div className="container">
        <h1>Offers</h1>
        <p className="dashboard__meta">Negotiate prices with buyers and sellers.</p>
        <div className="offers-tabs">
          <button type="button" className={tab === 'mine' ? 'offers-tabs__btn offers-tabs__btn--active' : 'offers-tabs__btn'} onClick={() => setTab('mine')}>
            Offers I sent
          </button>
          <button type="button" className={tab === 'incoming' ? 'offers-tabs__btn offers-tabs__btn--active' : 'offers-tabs__btn'} onClick={() => setTab('incoming')}>
            Offers received
          </button>
        </div>
        {error && <p className="auth-error">{error}</p>}
        {loading ? (
          <p className="auth-loading">Loading…</p>
        ) : offers.length === 0 ? (
          <p className="auth-subtitle">
            {tab === 'mine' ? 'No offers sent yet. Browse listings and make an offer on negotiable items.' : 'No incoming offers yet.'}
          </p>
        ) : (
          <ul className="offer-list">
            {offers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} role={tab === 'mine' ? 'buyer' : 'seller'} onUpdate={load} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ContactSellerButton({ product }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <p className="auth-subtitle">
        <Link to="/login">Log in</Link> to contact the seller.
      </p>
    );
  }

  if (user.id === product.seller?.id) return null;

  const handleClick = async () => {
    setBusy(true);
    try {
      const conversation = await startConversation(product.id);
      navigate(`/app/messages/${conversation.id}`);
    } catch (err) {
      window.alert(err.response?.data?.error?.message || 'Could not start conversation.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className="header__btn header__btn--primary contact-seller-btn" onClick={handleClick} disabled={busy}>
      {busy ? 'Opening…' : 'Contact seller'}
    </button>
  );
}

function MessagesPage() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchConversations()
      .then(setConversations)
      .catch(() => setError('Failed to load messages.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="dashboard">
      <div className="container">
        <h1>Messages</h1>
        <p className="dashboard__meta">Your conversations about listings.</p>
        {error && <p className="auth-error">{error}</p>}
        {loading ? (
          <p className="auth-loading">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="auth-subtitle">No conversations yet. Contact a seller from a listing page.</p>
        ) : (
          <ul className="conversation-list">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link to={`/app/messages/${c.id}`} className="conversation-item">
                  <div className="conversation-item__main">
                    <strong>{c.otherUser.displayName}</strong>
                    <span className="conversation-item__product">{c.productTitle || 'Listing'}</span>
                    {c.lastMessage && (
                      <p className="conversation-item__preview">
                        {c.lastMessage.body.length > 80 ? `${c.lastMessage.body.slice(0, 80)}…` : c.lastMessage.body}
                      </p>
                    )}
                  </div>
                  <div className="conversation-item__meta">
                    {c.lastMessage && (
                      <span className="conversation-item__time">
                        {new Date(c.lastMessage.createdAt).toLocaleDateString()}
                      </span>
                    )}
                    {c.unreadCount > 0 && (
                      <span className="conversation-item__unread">{c.unreadCount}</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ConversationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const threadRef = useRef(null);
  const prevMessageCountRef = useRef(0);
  const isNearBottomRef = useRef(true);

  const scrollThreadToBottom = (smooth = false) => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  const handleThreadScroll = () => {
    const el = threadRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    prevMessageCountRef.current = 0;
    isNearBottomRef.current = true;
    let cancelled = false;
    const loadThread = async () => {
      try {
        const data = await fetchConversation(id);
        if (cancelled) return;
        setConversation(data.conversation);
        setMessages(data.messages);
        await markConversationRead(id);
      } catch {
        if (!cancelled) setError('Conversation not found.');
      }
    };
    loadThread();
    const interval = setInterval(loadThread, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [id]);

  useEffect(() => {
    if (!messages.length) return;

    const isInitialLoad = prevMessageCountRef.current === 0;
    const hasNewMessages = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    if (isInitialLoad || (hasNewMessages && isNearBottomRef.current)) {
      scrollThreadToBottom(!isInitialLoad);
    }
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      const message = await sendMessage(id, body.trim());
      isNearBottomRef.current = true;
      setMessages((prev) => [...prev, message]);
      setBody('');
    } catch (err) {
      window.alert(err.response?.data?.error?.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  if (error) return <div className="container auth-loading">{error}</div>;
  if (!conversation) return <div className="container auth-loading">Loading…</div>;

  return (
    <div className="dashboard">
      <div className="container narrow chat-page">
        <div className="chat-header">
          <button type="button" className="header__btn header__btn--ghost" onClick={() => navigate('/app/messages')}>
            ← Back
          </button>
          <div>
            <h1>{conversation.otherUser.displayName}</h1>
            <p className="auth-subtitle">
              {conversation.productTitle && (
                <Link to={`/products/${conversation.productId}`}>{conversation.productTitle}</Link>
              )}
            </p>
          </div>
        </div>
        <div className="chat-thread" ref={threadRef} onScroll={handleThreadScroll}>
          {messages.length === 0 ? (
            <p className="auth-subtitle chat-thread__empty">No messages yet. Say hello!</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={m.isMine ? 'chat-bubble chat-bubble--mine' : 'chat-bubble chat-bubble--theirs'}>
                <p>{m.body}</p>
                <time>{new Date(m.createdAt).toLocaleString()}</time>
              </div>
            ))
          )}
        </div>
        <form className="chat-compose" onSubmit={handleSend}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a message…"
            rows={2}
            maxLength={5000}
            required
          />
          <button type="submit" className="auth-submit" disabled={sending || !body.trim()}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
}

function PlaceOrderPanel({ product, offerId }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [fulfillmentType, setFulfillmentType] = useState(product.meetupAvailable ? 'MEETUP' : 'DELIVERY');
  const [meetupNote, setMeetupNote] = useState('');
  const [address, setAddress] = useState({
    street: '', city: user?.city || DEFAULT_CITY, district: user?.district || DEFAULT_DISTRICT, phone: user?.phone || '',
  });
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (fulfillmentType !== 'DELIVERY' || !address.city.trim()) {
      setQuote(null);
      setQuoteError('');
      setQuoteLoading(false);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    setQuoteError('');
    fetchOrderQuote(product.id, address.city.trim())
      .then((q) => {
        if (!cancelled) {
          setQuote(q);
          setQuoteError('');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setQuote(null);
          setQuoteError(err.response?.data?.error?.message || 'Could not calculate delivery for this address.');
        }
      })
      .finally(() => { if (!cancelled) setQuoteLoading(false); });
    return () => { cancelled = true; };
  }, [fulfillmentType, address.city, product.id]);

  if (!user) {
    return (
      <div className="offer-panel">
        <h2>Place order</h2>
        <p className="auth-subtitle"><Link to="/login">Log in</Link> to buy this item.</p>
      </div>
    );
  }

  if (user.id === product.seller?.id) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const order = await createOrder({
        productId: product.id,
        fulfillmentType,
        offerId: offerId || undefined,
        meetupLocationNote: fulfillmentType === 'MEETUP' ? meetupNote : undefined,
        deliveryAddress: fulfillmentType === 'DELIVERY' ? address : undefined,
      });
      navigate(`/app/orders/${order.id}`);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to place order.');
    } finally {
      setSubmitting(false);
    }
  };

  const productPrice = Number(product.price);
  const deliveryTotal = quote ? Number(quote.totalDelivery) : 0;
  const total = productPrice + deliveryTotal;
  const deliveryBlocked = fulfillmentType === 'DELIVERY' && (!quote || !!quoteError || quoteLoading);

  return (
    <div className="offer-panel">
      <h2>Place order</h2>
      {offerId && <p className="auth-subtitle">Using your accepted offer price.</p>}
      <form className="auth-form" onSubmit={handleSubmit}>
        <fieldset className="order-fulfillment">
          <legend>Fulfillment</legend>
          {product.meetupAvailable && (
            <label className="checkbox-label">
              <input type="radio" name="fulfillment" value="MEETUP" checked={fulfillmentType === 'MEETUP'} onChange={() => setFulfillmentType('MEETUP')} />
              Meetup (free)
            </label>
          )}
          {product.deliveryEligible && (
            <label className="checkbox-label">
              <input type="radio" name="fulfillment" value="DELIVERY" checked={fulfillmentType === 'DELIVERY'} onChange={() => setFulfillmentType('DELIVERY')} />
              Delivery
            </label>
          )}
        </fieldset>
        {fulfillmentType === 'MEETUP' && (
          <label>
            Meetup preference (optional)
            <input value={meetupNote} onChange={(e) => setMeetupNote(e.target.value)} placeholder="Preferred area or time…" />
          </label>
        )}
        {fulfillmentType === 'DELIVERY' && (
          <>
            <label>Street address<input name="street" value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} required minLength={3} /></label>
            <label>City<input name="city" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} required /></label>
            <label>District<input name="district" value={address.district} onChange={(e) => setAddress({ ...address, district: e.target.value })} required /></label>
            <label>Phone<input name="phone" value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} required /></label>
            {quoteLoading && <p className="auth-subtitle">Calculating delivery…</p>}
            {quote && (
              <p className="auth-subtitle">
                Delivery: {formatPrice(quote.deliveryCharge)}
                {quote.trolleyCharge > 0 && ` + trolley ${formatPrice(quote.trolleyCharge)}`}
                {' '}({quote.distanceKm} km)
              </p>
            )}
            {quoteError && <p className="auth-error form-feedback">{quoteError}</p>}
          </>
        )}
        <p className="order-total">
          Estimated total:{' '}
          <strong>
            {fulfillmentType === 'MEETUP'
              ? (offerId ? 'Based on accepted offer' : formatPrice(productPrice))
              : quote
                ? formatPrice(total)
                : (offerId ? 'Accepted offer + delivery (pending quote)' : `${formatPrice(productPrice)} + delivery`)}
          </strong>
        </p>
        {error && <p className="auth-error form-feedback">{error}</p>}
        {success && <p className="auth-success form-feedback">{success}</p>}
        <button type="submit" className="auth-submit" disabled={submitting || deliveryBlocked}>
          {submitting ? 'Placing order…' : 'Place order'}
        </button>
      </form>
    </div>
  );
}

function OrderCard({ order }) {
  return (
    <li className="order-card">
      <Link to={`/app/orders/${order.id}`} className="order-card__link">
        <div>
          <strong>{order.productTitle}</strong>
          <p className="order-card__meta">{order.orderNumber} · {order.fulfillmentType === 'MEETUP' ? 'Meetup' : 'Delivery'}</p>
          <p className="order-card__date">{new Date(order.createdAt).toLocaleString()}</p>
        </div>
        <div className="order-card__side">
          <p className="order-card__amount">{formatPrice(order.totalAmount)}</p>
          <span className={`badge badge--order badge--order-${order.status.toLowerCase()}`}>
            {ORDER_STATUS_LABELS[order.status] || order.status}
          </span>
        </div>
      </Link>
    </li>
  );
}

function OrdersPage() {
  const [tab, setTab] = useState('purchases');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const fetcher = tab === 'purchases' ? fetchMyOrders : fetchSalesOrders;
    fetcher()
      .then(setOrders)
      .catch(() => setError('Failed to load orders.'))
      .finally(() => setLoading(false));
  }, [tab]);

  return (
    <div className="dashboard">
      <div className="container">
        <h1>Orders</h1>
        <p className="dashboard__meta">Track your purchases and sales.</p>
        <div className="offers-tabs">
          <button type="button" className={tab === 'purchases' ? 'offers-tabs__btn offers-tabs__btn--active' : 'offers-tabs__btn'} onClick={() => setTab('purchases')}>My purchases</button>
          <button type="button" className={tab === 'sales' ? 'offers-tabs__btn offers-tabs__btn--active' : 'offers-tabs__btn'} onClick={() => setTab('sales')}>My sales</button>
        </div>
        {error && <p className="auth-error">{error}</p>}
        {loading ? (
          <p className="auth-loading">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="auth-subtitle">No orders yet.</p>
        ) : (
          <ul className="order-list">{orders.map((o) => <OrderCard key={o.id} order={o} />)}</ul>
        )}
      </div>
    </div>
  );
}

function OrderDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchOrder(id)
      .then(setData)
      .catch((err) => setError(err.response?.data?.error?.message || 'Order not found.'));
  }, [id]);

  const reload = () => {
    fetchOrder(id)
      .then(setData)
      .catch((err) => setError(err.response?.data?.error?.message || 'Order not found.'));
  };

  const run = async (action) => {
    setBusy(true);
    try {
      await action();
      reload();
    } catch (err) {
      window.alert(err.response?.data?.error?.message || 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="container auth-loading">{error}</div>;
  if (!data) return <div className="container auth-loading">Loading…</div>;

  const { order, history } = data;
  const isBuyer = user?.id === order.buyerId;
  const isSeller = user?.id === order.sellerId;

  const nextSellerStatus = order.status === 'CONFIRMED'
    ? (order.fulfillmentType === 'MEETUP' ? 'READY_FOR_MEETUP' : 'READY_FOR_DELIVERY')
    : order.status === 'READY_FOR_DELIVERY' ? 'IN_TRANSIT'
      : order.status === 'IN_TRANSIT' ? 'DELIVERED' : null;

  return (
    <div className="dashboard">
      <div className="container narrow">
        <button type="button" className="header__btn header__btn--ghost" onClick={() => navigate('/app/orders')}>← Back to orders</button>
        <h1>{order.productTitle}</h1>
        <p className="dashboard__meta">{order.orderNumber} · {ORDER_STATUS_LABELS[order.status]}</p>
        <div className="order-detail">
          <dl className="product-detail__facts">
            <div><dt>Item price</dt><dd>{formatPrice(order.productPrice)}</dd></div>
            {order.deliveryCharge > 0 && <div><dt>Delivery</dt><dd>{formatPrice(order.deliveryCharge)}</dd></div>}
            {order.trolleyCharge > 0 && <div><dt>Trolley</dt><dd>{formatPrice(order.trolleyCharge)}</dd></div>}
            <div><dt>Total</dt><dd><strong>{formatPrice(order.totalAmount)}</strong></dd></div>
            <div><dt>Fulfillment</dt><dd>{order.fulfillmentType === 'MEETUP' ? 'Meetup' : 'Delivery'}</dd></div>
            <div>
              <dt>Buyer</dt>
              <dd><Link to={`/sellers/${order.buyerId}`}>{order.buyerName || 'FERILO user'}</Link></dd>
            </div>
            <div>
              <dt>Seller</dt>
              <dd><Link to={`/sellers/${order.sellerId}`}>{order.sellerName || 'FERILO user'}</Link></dd>
            </div>
            {order.meetupLocationNote && <div><dt>Meetup note</dt><dd>{order.meetupLocationNote}</dd></div>}
            {order.deliveryAddress && (
              <div><dt>Delivery to</dt><dd>{order.deliveryAddress.street}, {order.deliveryAddress.city}</dd></div>
            )}
          </dl>
          <div className="order-actions">
            {isSeller && order.status === 'PENDING' && (
              <button type="button" className="header__btn header__btn--primary" disabled={busy} onClick={() => run(() => confirmOrder(order.id))}>Confirm order</button>
            )}
            {isSeller && nextSellerStatus && (
              <button type="button" className="header__btn header__btn--primary" disabled={busy} onClick={() => run(() => updateOrderStatus(order.id, { status: nextSellerStatus }))}>
                Mark as {ORDER_STATUS_LABELS[nextSellerStatus]}
              </button>
            )}
            {((isBuyer && order.status === 'DELIVERED') || (order.fulfillmentType === 'MEETUP' && order.status === 'READY_FOR_MEETUP')) && (
              <button type="button" className="header__btn header__btn--primary" disabled={busy} onClick={() => run(() => completeOrder(order.id))}>Mark completed</button>
            )}
            {['PENDING', 'CONFIRMED'].includes(order.status) && (
              <button type="button" className="header__btn header__btn--ghost" disabled={busy} onClick={() => {
                const reason = window.prompt('Cancellation reason (min 3 characters):');
                if (!reason || reason.length < 3) return;
                run(() => cancelOrder(order.id, reason));
              }}>Cancel order</button>
            )}
            <Link to={`/products/${order.productId}`} className="header__btn header__btn--ghost">View listing</Link>
          </div>
          <OrderReviewSection order={order} />
          {history?.length > 0 && (
            <div className="order-history">
              <h2>Status history</h2>
              <ul>
                {history.map((h, i) => (
                  <li key={i}>
                    <strong>{ORDER_STATUS_LABELS[h.toStatus] || h.toStatus}</strong>
                    {h.note && ` — ${h.note}`}
                    <span className="order-card__date"> · {new Date(h.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function relativeTime(value) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function NotificationsPage() {
  const { setUnreadCount } = useNotifications();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchNotifications({ limit: 50 })
      .then((data) => {
        if (cancelled) return;
        setItems(data.notifications);
        setUnreadCount(data.unreadCount);
      })
      .catch(() => { if (!cancelled) setError('Failed to load notifications.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [setUnreadCount]);

  const handleOpen = async (notification) => {
    if (!notification.isRead) {
      setItems((prev) => prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)));
      try {
        const result = await markNotificationRead(notification.id);
        setUnreadCount(result.unreadCount);
      } catch {
        /* the optimistic update is good enough here */
      }
    }
    if (notification.link) navigate(notification.link);
  };

  const handleMarkAll = async () => {
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      window.alert(err.response?.data?.error?.message || 'Could not mark all as read.');
    }
  };

  const unread = items.filter((n) => !n.isRead).length;

  return (
    <div className="dashboard">
      <div className="container">
        <div className="notif-head">
          <div>
            <h1>Notifications</h1>
            <p className="dashboard__meta">
              {unread > 0 ? `${unread} unread` : 'You are all caught up.'}
            </p>
          </div>
          {unread > 0 && (
            <button type="button" className="header__btn header__btn--ghost" onClick={handleMarkAll}>
              Mark all read
            </button>
          )}
        </div>
        {error && <p className="auth-error">{error}</p>}
        {loading ? (
          <p className="auth-loading">Loading…</p>
        ) : items.length === 0 ? (
          <p className="auth-subtitle">No notifications yet. Offers, orders and reviews will show up here.</p>
        ) : (
          <ul className="notif-list">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={n.isRead ? 'notif-item' : 'notif-item notif-item--unread'}
                  onClick={() => handleOpen(n)}
                >
                  <span className="notif-item__title">{n.title}</span>
                  <span className="notif-item__body">{n.body}</span>
                  <span className="notif-item__time">{relativeTime(n.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stars({ value = 0, className = '' }) {
  const rating = Number(value) || 0;
  const filled = Math.round(rating);
  return (
    <span className={`stars ${className}`.trim()} aria-label={`${rating.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden="true" className={n <= filled ? 'stars__star stars__star--on' : 'stars__star'}>★</span>
      ))}
    </span>
  );
}

function RatingInput({ value, onChange, disabled }) {
  return (
    <div className="rating-input" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={n <= value ? 'rating-input__star rating-input__star--on' : 'rating-input__star'}
          disabled={disabled}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function ReviewCard({ review, showProduct = false }) {
  return (
    <li className="review-card">
      <div className="review-card__head">
        <strong>{review.reviewerName || 'FERILO user'}</strong>
        <Stars value={review.rating} />
      </div>
      <p className="review-card__meta">
        {review.reviewerRole === 'BUYER' ? 'As buyer' : 'As seller'}
        {' · '}
        {new Date(review.createdAt).toLocaleDateString()}
        {showProduct && review.productTitle && (
          <> · <Link to={`/products/${review.productId}`}>{review.productTitle}</Link></>
        )}
      </p>
      {review.comment && <p className="review-card__comment">{review.comment}</p>}
    </li>
  );
}

function OrderReviewSection({ order }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchOrderReviews(order.id)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [order.id, order.status]);

  if (!data) return null;

  const counterpartName = (user?.id === order.buyerId ? order.sellerName : order.buyerName) || 'the other member';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await createReview(order.id, { rating, comment: comment.trim() || undefined });
      setData(await fetchOrderReviews(order.id));
      setComment('');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not submit your review.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="order-reviews">
      <h2>Reviews</h2>
      {order.status !== 'COMPLETED' && (
        <p className="auth-subtitle">Reviews open once this order is marked completed.</p>
      )}
      {data.canReview && (
        <form className="auth-form review-form" onSubmit={handleSubmit}>
          <p className="auth-subtitle">How was your experience with {counterpartName}?</p>
          <RatingInput value={rating} onChange={setRating} disabled={submitting} />
          <label>
            Comment (optional)
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Was the item as described? How was the handover?"
            />
          </label>
          {error && <p className="auth-error form-feedback">{error}</p>}
          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit review'}
          </button>
        </form>
      )}
      {data.reviews.length > 0 ? (
        <ul className="review-list">
          {data.reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
        </ul>
      ) : (
        order.status === 'COMPLETED' && !data.canReview && <p className="auth-subtitle">No reviews yet.</p>
      )}
    </div>
  );
}

function RatingSummary({ label, stats }) {
  return (
    <div className="rating-summary__item">
      <span className="rating-summary__label">{label}</span>
      <Stars value={stats.average} />
      <span className="rating-summary__count">
        {stats.count > 0 ? `${stats.average.toFixed(1)} · ${stats.count} review${stats.count === 1 ? '' : 's'}` : 'No reviews yet'}
      </span>
    </div>
  );
}

function MemberProfilePage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');
    fetchUserReviews(id)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error?.message || 'Member not found.');
      });
    return () => { cancelled = true; };
  }, [id]);

  if (error) return <div className="container auth-loading">{error}</div>;
  if (!data) return <div className="container auth-loading">Loading…</div>;

  const { user, summary, reviews } = data;

  return (
    <div className="dashboard">
      <div className="container narrow">
        <h1>{user.displayName || 'FERILO user'}</h1>
        <p className="dashboard__meta">
          {user.city ? `${user.city}${user.district ? `, ${user.district}` : ''} · ` : ''}
          Member since {new Date(user.memberSince).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </p>
        {user.verificationStatus === 'VERIFIED' && <span className="badge badge--verified">Verified</span>}
        {user.bio && <p className="product-detail__desc">{user.bio}</p>}
        <div className="rating-summary">
          <RatingSummary label="As seller" stats={summary.asSeller} />
          <RatingSummary label="As buyer" stats={summary.asBuyer} />
        </div>
        <p className="dashboard__meta">
          {user.totalSales} completed sale{user.totalSales === 1 ? '' : 's'} · {user.totalPurchases} purchase{user.totalPurchases === 1 ? '' : 's'}
        </p>
        <ReportPanel targetType="USER" targetId={user.id} label="Report member" hideForUserId={user.id} />
        <h2>Reviews</h2>
        {reviews.length === 0 ? (
          <p className="auth-subtitle">No reviews yet.</p>
        ) : (
          <ul className="review-list">
            {reviews.map((r) => <ReviewCard key={r.id} review={r} showProduct />)}
          </ul>
        )}
      </div>
    </div>
  );
}

function ProductDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const offerId = searchParams.get('offerId');
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProduct(id).then(setProduct).catch(() => setError('Product not found.'));
  }, [id]);

  if (error) return <div className="container auth-loading">{error}</div>;
  if (!product) return <div className="container auth-loading">Loading…</div>;

  return (
    <div className="dashboard">
      <div className="container product-detail">
        <div className="product-detail__gallery">
          {product.images?.length ? (
            product.images.map((img) => (
              <img key={img.id} src={img.url} alt={product.title} loading="lazy" />
            ))
          ) : (
            <div className="product-card__placeholder">No images</div>
          )}
        </div>
        <div className="product-detail__info">
          <div className="product-detail__head">
            <h1>{product.title}</h1>
            <FavoriteButton productId={product.id} sellerId={product.seller?.id} className="favorite-btn--large" />
          </div>
          <p className="product-card__price">{formatPrice(product.price)}</p>
          <p className="product-card__meta">
            {product.condition} · {product.city}, {product.district}
          </p>
          {product.seller?.verificationStatus === 'VERIFIED' && (
            <span className="badge badge--verified">Verified seller</span>
          )}
          <p className="product-detail__desc">{product.description}</p>
          <dl className="product-detail__facts">
            <div><dt>Category</dt><dd>{product.categoryName}</dd></div>
            {product.brand && <div><dt>Brand</dt><dd>{product.brand}</dd></div>}
            {product.isNegotiable && <div><dt>Price</dt><dd>Negotiable</dd></div>}
            <div><dt>Delivery</dt><dd>{product.deliveryEligible ? 'Available' : 'Meetup only'}</dd></div>
          </dl>
          <p className="auth-subtitle product-detail__seller">
            Seller:{' '}
            {product.seller?.id ? (
              <Link to={`/sellers/${product.seller.id}`}>{product.seller.displayName || 'FERILO user'}</Link>
            ) : (
              'Unknown'
            )}
            {Number(product.seller?.sellerRatingAvg) > 0 && (
              <>
                {' '}
                <Stars value={product.seller.sellerRatingAvg} />
                {' '}
                {Number(product.seller.sellerRatingAvg).toFixed(1)}
              </>
            )}
          </p>
          <ContactSellerButton product={product} />
          <MakeOfferPanel product={product} />
          <PlaceOrderPanel product={product} offerId={offerId} />
          <ReportPanel targetType="PRODUCT" targetId={product.id} label="Report listing" hideForUserId={product.seller?.id} />
        </div>
      </div>
    </div>
  );
}

function FavoritesPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { refreshFavorites } = useFavorites();

  const load = () => {
    setLoading(true);
    setError('');
    fetchFavorites()
      .then(setItems)
      .catch(() => setError('Failed to load saved listings.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleRemove = async (productId) => {
    try {
      await removeFavorite(productId);
      setItems((prev) => prev.filter((p) => p.id !== productId));
      await refreshFavorites();
    } catch (err) {
      window.alert(err.response?.data?.error?.message || 'Could not remove favorite.');
    }
  };

  return (
    <div className="dashboard">
      <div className="container">
        <h1>Saved listings</h1>
        <p className="dashboard__meta">Listings you saved to review or buy later.</p>
        {error && <p className="auth-error">{error}</p>}
        {loading ? (
          <p className="auth-loading">Loading…</p>
        ) : items.length === 0 ? (
          <p className="auth-subtitle">No saved listings yet. Browse items and tap ♡ to save them.</p>
        ) : (
          <ul className="product-grid">
            {items.map((p) => (
              <li key={p.id} className="product-grid__item">
                <Link to={`/products/${p.id}`} className="product-card">
                  <div className="product-card__img">
                    {p.images?.[0]?.url ? (
                      <img src={p.images[0].url} alt="" loading="lazy" />
                    ) : (
                      <span className="product-card__placeholder">No image</span>
                    )}
                  </div>
                  <div className="product-card__body">
                    <h2>{p.title}</h2>
                    <p className="product-card__price">{formatPrice(p.price)}</p>
                    <p className="product-card__meta">{p.condition.replace('_', ' ').toLowerCase()} · {p.city}</p>
                  </div>
                </Link>
                <button
                  type="button"
                  className="header__btn header__btn--ghost favorites-page__remove"
                  onClick={() => handleRemove(p.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MyListingsPage() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchMyProducts().then(setListings).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this listing?')) return;
    await deleteProduct(id);
    load();
  };

  const activeCount = listings.filter((p) => p.status === 'ACTIVE').length;
  const draftCount = listings.filter((p) => p.status === 'DRAFT').length;
  const otherCount = listings.length - activeCount - draftCount;
  const countParts = [];
  if (activeCount) countParts.push(`${activeCount} active`);
  if (draftCount) countParts.push(`${draftCount} draft`);
  if (otherCount) countParts.push(`${otherCount} other`);

  return (
    <div className="dashboard">
      <div className="container">
        <div className="categories__head">
          <h1>My Listings</h1>
          <div className="listings-head__actions">
            {!loading && (
              <span className="listings-head__count">
                {listings.length} total
                {countParts.length > 0 ? ` · ${countParts.join(' · ')}` : ''}
              </span>
            )}
            <Link to="/app/listings/new" className="header__btn header__btn--primary">+ New listing</Link>
          </div>
        </div>
        {loading ? (
          <p className="auth-loading">Loading…</p>
        ) : listings.length === 0 ? (
          <p className="auth-subtitle">No listings yet. <Link to="/app/listings/new">Create your first ad</Link></p>
        ) : (
          <ul className="admin-list">
            {listings.map((p) => (
              <li key={p.id} className="admin-list__item">
                <div>
                  <strong>{p.title}</strong>
                  <p>{formatPrice(p.price)} · {p.status} · {p.city}</p>
                </div>
                <div className="admin-list__actions">
                  <Link to={`/app/listings/${p.id}/edit`} className="header__btn header__btn--ghost">Edit</Link>
                  {p.status === 'DRAFT' && (
                    <button type="button" className="header__btn header__btn--primary" onClick={async () => { await publishProduct(p.id); load(); }}>
                      Publish
                    </button>
                  )}
                  <button type="button" className="header__btn header__btn--ghost" onClick={() => handleDelete(p.id)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ListingFormPage({ editId }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [pageError, setPageError] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [photosMessage, setPhotosMessage] = useState('');
  const [photosError, setPhotosError] = useState('');
  const [saving, setSaving] = useState(false);
  const [productId, setProductId] = useState(editId || null);
  const [images, setImages] = useState([]);
  const [form, setForm] = useState({
    title: '', description: '', categoryId: '', condition: 'GOOD', price: '',
    city: user?.city || DEFAULT_CITY, district: user?.district || DEFAULT_DISTRICT,
    brand: '', isNegotiable: true, deliverySizeTier: 'SMALL', requiresTrolley: false,
  });

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => {});
    if (editId) {
      fetchMyProduct(editId).then((p) => {
        setForm({
          title: p.title, description: p.description, categoryId: String(p.categoryId),
          condition: p.condition, price: String(p.price), city: p.city, district: p.district,
          brand: p.brand || '', isNegotiable: p.isNegotiable, deliverySizeTier: p.deliverySizeTier,
          requiresTrolley: p.requiresTrolley,
        });
        setImages(p.images || []);
      }).catch(() => setPageError('Listing not found.'));
    }
  }, [editId]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    setFormMessage('');
    try {
      const payload = {
        ...form,
        categoryId: Number(form.categoryId),
        price: Number(form.price),
      };
      let product;
      if (productId) {
        product = await updateProduct(productId, payload);
      } else {
        product = await createProduct(payload);
        if (!product?.id) throw new Error('Invalid response from server');
        setProductId(product.id);
      }
      setFormMessage('Listing saved as draft.');
      return product;
    } catch (err) {
      setFormError(err.response?.data?.error?.message || err.message || 'Failed to save.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleImages = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (!productId) {
      setPhotosError('Save the listing first, then upload images.');
      return;
    }
    setSaving(true);
    setPhotosError('');
    setPhotosMessage('');
    try {
      const product = await uploadProductImages(productId, files);
      setImages(product.images || []);
      setPhotosMessage('Images uploaded.');
    } catch (err) {
      setPhotosError(err.response?.data?.error?.message || 'Image upload failed.');
    } finally {
      setSaving(false);
      e.target.value = '';
    }
  };

  const handleRemoveImage = async (imageId) => {
    if (!productId) return;
    setSaving(true);
    setPhotosError('');
    setPhotosMessage('');
    try {
      await deleteProductImage(productId, imageId);
      setImages((prev) => prev.filter((img) => img.id !== imageId));
      setPhotosMessage('Photo removed.');
    } catch (err) {
      setPhotosError(err.response?.data?.error?.message || 'Failed to remove photo.');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!productId) {
      setPhotosError('Save the listing and add at least one image first.');
      return;
    }
    setSaving(true);
    setPhotosError('');
    try {
      await publishProduct(productId);
      navigate('/app/listings');
    } catch (err) {
      setPhotosError(err.response?.data?.error?.message || 'Publish failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard">
      <div className="container narrow">
        <h1>{editId ? 'Edit listing' : 'Create listing'}</h1>
        {pageError && <p className="auth-error">{pageError}</p>}
        <form className="auth-form profile-form" onSubmit={handleSave}>
          <label>Title<input name="title" value={form.title} onChange={handleChange} required minLength={3} /></label>
          <label>Description<textarea name="description" value={form.description} onChange={handleChange} required minLength={10} rows={5} /></label>
          <label>Category
            <select name="categoryId" value={form.categoryId} onChange={handleChange} required>
              <option value="">Select category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Condition
            <select name="condition" value={form.condition} onChange={handleChange}>
              {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <label>Price (NPR)<input name="price" type="number" min="0" value={form.price} onChange={handleChange} required /></label>
          <label>Brand (optional)<input name="brand" value={form.brand} onChange={handleChange} /></label>
          <label>City<input name="city" value={form.city} onChange={handleChange} required /></label>
          <label>District<input name="district" value={form.district} onChange={handleChange} required /></label>
          <label>Delivery size
            <select name="deliverySizeTier" value={form.deliverySizeTier} onChange={handleChange}>
              {SIZE_TIERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label className="checkbox-label">
            <input name="isNegotiable" type="checkbox" checked={form.isNegotiable} onChange={handleChange} /> Price is negotiable
          </label>
          <label className="checkbox-label">
            <input name="requiresTrolley" type="checkbox" checked={form.requiresTrolley} onChange={handleChange} /> Requires trolley (large item)
          </label>
          <button type="submit" className="auth-submit" disabled={saving}>{saving ? 'Saving…' : 'Save draft'}</button>
          {formMessage && <p className="auth-success form-feedback">{formMessage}</p>}
          {formError && <p className="auth-error form-feedback">{formError}</p>}
        </form>
        {productId && (
          <div className="listing-images">
            <h2>Photos ({images.length}/8)</h2>
            {photosMessage && <p className="auth-success form-feedback">{photosMessage}</p>}
            {photosError && <p className="auth-error form-feedback">{photosError}</p>}
            <div className="listing-images__grid">
              {images.map((img) => (
                <div key={img.id} className="listing-images__item">
                  <img src={img.url} alt="" />
                  <button
                    type="button"
                    className="listing-images__remove"
                    onClick={() => handleRemoveImage(img.id)}
                    disabled={saving}
                    aria-label="Remove photo"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <label className="auth-form">
              Add images
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleImages} />
            </label>
            <button type="button" className="auth-submit" onClick={handlePublish} disabled={saving || images.length < 1}>
              Publish listing
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EditListingPage() {
  const { id } = useParams();
  return <ListingFormPage editId={id} />;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="container auth-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'ADMIN') return <Navigate to="/app/dashboard" replace />;
  return children;
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="container auth-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="container auth-loading">Loading…</div>;
  if (user) return <Navigate to="/app/dashboard" replace />;
  return children;
}

function Layout() {
  return (
    <div className="app-layout">
      <ScrollToTop />
      <Header />
      <main className="app-main"><Outlet /></main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AreaProvider>
        <NotificationsProvider>
          <FavoritesProvider>
            <Routes>
              <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/browse" element={<BrowsePage />} />
              <Route path="/categories/:slug" element={<CategoryPage />} />
              <Route path="/products/:id" element={<ProductDetailPage />} />
              <Route path="/sellers/:id" element={<MemberProfilePage />} />
              <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
              <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
              <Route path="/app/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
              <Route path="/app/favorites" element={<ProtectedRoute><FavoritesPage /></ProtectedRoute>} />
              <Route path="/app/offers" element={<ProtectedRoute><OffersPage /></ProtectedRoute>} />
              <Route path="/app/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
              <Route path="/app/messages/:id" element={<ProtectedRoute><ConversationPage /></ProtectedRoute>} />
              <Route path="/app/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
              <Route path="/app/orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
              <Route path="/app/orders/:id" element={<ProtectedRoute><OrderDetailPage /></ProtectedRoute>} />
              <Route path="/app/listings" element={<ProtectedRoute><MyListingsPage /></ProtectedRoute>} />
              <Route path="/app/listings/new" element={<ProtectedRoute><VerifiedRoute><ListingFormPage /></VerifiedRoute></ProtectedRoute>} />
              <Route path="/app/listings/:id/edit" element={<ProtectedRoute><VerifiedRoute><EditListingPage /></VerifiedRoute></ProtectedRoute>} />
              <Route path="/app/reports" element={<ProtectedRoute><MyReportsPage /></ProtectedRoute>} />
              <Route path="/app/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
              <Route path="/app/verification" element={<ProtectedRoute><VerificationPage /></ProtectedRoute>} />
              <Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
              <Route path="/admin/verifications" element={<AdminRoute><AdminVerificationsPage /></AdminRoute>} />
              <Route path="/admin/reports" element={<AdminRoute><AdminReportsPage /></AdminRoute>} />
              <Route path="/admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
              <Route path="/admin/listings" element={<AdminRoute><AdminListingsPage /></AdminRoute>} />
              <Route path="/admin/orders" element={<AdminRoute><AdminOrdersPage /></AdminRoute>} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/help" element={<StaticPage title="Help Center"><p>Browse safely, meet in public places, and verify sellers before paying. Use Reports if something looks wrong.</p></StaticPage>} />
              <Route path="/help/how-to-buy" element={<StaticPage title="How to Buy"><p>Search or browse, message the seller, make an offer if negotiable, then place a meetup or delivery order.</p></StaticPage>} />
              <Route path="/help/how-to-sell" element={<StaticPage title="How to Sell"><p>Verify your identity, create a listing with clear photos, confirm orders promptly, and complete the handover.</p></StaticPage>} />
              <Route path="/help/safety" element={<StaticPage title="Safety Tips"><p>Prefer verified sellers, avoid off-platform payments, and report scams from the listing or member profile.</p></StaticPage>} />
              <Route path="/blog" element={<StaticPage title="Blog"><p>Tips and marketplace news will appear here soon.</p></StaticPage>} />
              <Route path="/terms" element={<StaticPage title="Terms and Conditions"><p>By using FERILO you agree to trade honestly, follow local laws, and accept our moderation decisions.</p></StaticPage>} />
              <Route path="/privacy" element={<StaticPage title="Privacy Policy"><p>We store account, listing, and order data to run the marketplace. Identity documents stay private and are used only for verification.</p></StaticPage>} />
              <Route path="/policies/prohibited-items" element={<StaticPage title="Prohibited & Restricted Items"><p>Weapons, drugs, stolen goods, and other illegal items are banned. Listings that break the rules may be removed.</p></StaticPage>} />
            </Route>
          </Routes>
          </FavoritesProvider>
        </NotificationsProvider>
      </AreaProvider>
    </AuthProvider>
  );
}
