/* ── PRELOADER ── */
window.addEventListener('load',()=>{
  setTimeout(()=>{
    const preloaderEl = document.getElementById('preloader');
    if (preloaderEl) preloaderEl.classList.add('gone');
    document.body.style.overflow='';
  },2000);
});
document.body.style.overflow='hidden';

/* ── CURSOR ── */
const cur=document.getElementById('cur');
const curR=document.getElementById('cur-r');
let mx=0,my=0,rx=0,ry=0;

if(cur && curR){
  document.addEventListener('mousemove',e=>{
    mx=e.clientX;my=e.clientY;
    cur.style.left=mx+'px';
    cur.style.top=my+'px';
  });

  function animRing(){
    rx+=(mx-rx)*.12;ry+=(my-ry)*.12;
    curR.style.left=rx+'px';
    curR.style.top=ry+'px';
    requestAnimationFrame(animRing);
  }
  animRing();
}
document.querySelectorAll('a,button,.coll-card,.prod-card,.social-icon,.nl-perk,.pillar').forEach(el=>{
  el.addEventListener('mouseenter',()=>document.body.classList.add('link-hover'));
  el.addEventListener('mouseleave',()=>document.body.classList.remove('link-hover'));
});

/* ── SCROLL EFFECTS ── */
const nav=document.getElementById('main-nav');
const btt=document.getElementById('btt');
const bar=document.getElementById('progress-bar');
window.addEventListener('scroll',()=>{
  const st=window.scrollY;
  const dh=document.documentElement.scrollHeight-window.innerHeight;
  bar.style.width=(st/dh*100)+'%';
  nav.classList.toggle('scrolled',st>20);
  btt.classList.toggle('visible',st>400);
});

/* ── INTERSECTION OBSERVER REVEALS ── */
const io=new IntersectionObserver(entries=>{
  entries.forEach(e=>{
    if(e.isIntersecting){
      e.target.classList.add('visible');
      io.unobserve(e.target);
    }
  });
},{threshold:.12});
document.querySelectorAll('.reveal,.process-step').forEach(el=>io.observe(el));

/* ── ECOMMERCE ── */
const CART_KEY='zivarr-demo-cart';
const USER_KEY='zivarr-demo-user';

// This script is included by many pages. Guard all page-specific DOM wiring.
const cartItems=document.getElementById('cartItems');
const subtotalAmount=document.getElementById('subtotalAmount');
const shippingAmount=document.getElementById('shippingAmount');
const totalAmount=document.getElementById('totalAmount');
const giftWrapAmount=document.getElementById('giftWrapAmount');
const cartCountBadge=document.getElementById('cartCountBadge');
const shippingNote=document.getElementById('shippingNote');
const loginStatus=document.getElementById('loginStatus');
const orderStatusBox=document.getElementById('orderStatusBox');
const loginForm=document.getElementById('loginForm');
const checkoutForm=document.getElementById('checkoutForm');
const guestCheckoutBtn=document.getElementById('guestCheckoutBtn');
const checkoutEmail=document.getElementById('checkoutEmail');
const customerName=document.getElementById('customerName');
const customerAddress=document.getElementById('customerAddress');
const customerPhone=document.getElementById('customerPhone');
const customerCity=document.getElementById('customerCity');
const customerPincode=document.getElementById('customerPincode');
const placeOrderBtn=document.getElementById('placeOrderBtn');
const clearFormBtn=document.getElementById('resetCartBtn');
const cartToggle=document.getElementById('cartToggle');
const loginToggle=document.getElementById('loginToggle');
let productCards=document.querySelectorAll('.prod-card');
let filterButtons=document.querySelectorAll('.feat-filter');
const productsGrid=document.querySelector('.products-grid');

let cart=[];
let currentUser=null;
let guestMode=false;

const hasCheckoutUI = !!(cartItems && subtotalAmount && shippingAmount && totalAmount && cartCountBadge && shippingNote && orderStatusBox && loginStatus && loginForm && checkoutForm && guestCheckoutBtn && checkoutEmail && customerName && customerAddress && customerPhone && customerCity && customerPincode && placeOrderBtn);
// Homepage: the Handpicked Favourites section uses .products-grid but cards may be empty at load.
const hasHomepageCommerce = !!(productsGrid && filterButtons && filterButtons.length);

function formatPrice(value){
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

function getApiBaseUrl(){
  if (typeof window === 'undefined' || !window.location) return process.env.URL || 'http://localhost:3000';

  if (window.location.protocol === 'file:') {
    return 'process.env.URL' in window ? window.process.env.URL : 'http://localhost:3000';
  }

  return window.location.origin || 'process.env.URL' in window ? window.process.env.URL : 'http://localhost:3000';
}

async function fetchProductsFromApi(){
  const endpoints = Array.from(new Set([
    '/api/products',
    `${getApiBaseUrl()}/api/products`,
  ]));

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint);
      const data = await response.json();

      if (response.ok && Array.isArray(data) && data.length > 0) {
        return data;
      }

      if (response.ok && Array.isArray(data)) {
        return data;
      }
    } catch (error) {
      // Try the next endpoint if this one fails.
    }
  }

  return [];
}

function loadCart(){
  try{
    const saved=localStorage.getItem(CART_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch(error){
    return [];
  }
}

function loadUser(){
  try{
    const saved=localStorage.getItem(USER_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch(error){
    return null;
  }
}

function saveCart(){
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function saveUser(){
  if(currentUser){
    localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

function updateCartUI(){
  const totalItems=cart.reduce((sum,item)=>sum + item.quantity,0);
  const subtotal=cart.reduce((sum,item)=>sum + item.price*item.quantity,0);
  const shipping=subtotal >= 2000 ? 0 : 149;
  const total=subtotal + shipping;

  document.querySelectorAll('.cart-dot').forEach(dot=>dot.textContent=totalItems);
  cartCountBadge.textContent=`${totalItems} item${totalItems===1?'':'s'}`;
  subtotalAmount.textContent=formatPrice(subtotal);
  shippingAmount.textContent=shipping===0 ? 'FREE' : formatPrice(shipping);
  totalAmount.textContent=formatPrice(total);
  giftWrapAmount.textContent='₹0';

  shippingNote.textContent = subtotal >= 2000 ? 'Free doorstep delivery unlocked for this order.' : 'Add items worth ₹2,000+ to unlock free doorstep delivery.';

  if(cart.length===0){
    cartItems.innerHTML='<div class="empty-cart">Your cart is empty. Add a few standout pieces to begin.</div>';
  } else {
    cartItems.innerHTML = cart.map(item=>`
      <article class="cart-item-row">
        <div class="cart-item-details">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-meta">${item.category} · ${formatPrice(item.price)} each</div>
        </div>
        <div class="cart-item-controls">
          <button type="button" class="qty-button" data-action="decrease" data-name="${item.name}">−</button>
          <span class="qty-value">${item.quantity}</span>
          <button type="button" class="qty-button" data-action="increase" data-name="${item.name}">+</button>
        </div>
        <div class="cart-item-total">${formatPrice(item.price*item.quantity)}</div>
        <button type="button" class="remove-item" data-name="${item.name}">Remove</button>
      </article>
    `).join('');
  }

  placeOrderBtn.disabled=cart.length===0;
  placeOrderBtn.textContent = cart.length===0 ? 'Add items to checkout' : 'Place Order';

  cartItems.querySelectorAll('.qty-button').forEach(button=>{
    button.addEventListener('click',()=>{
      adjustQuantity(button.dataset.name, button.dataset.action === 'increase' ? 1 : -1);
    });
  });

  cartItems.querySelectorAll('.remove-item').forEach(button=>{
    button.addEventListener('click',()=>removeItem(button.dataset.name));
  });
}

function applyFilter(filter){
  productCards.forEach(card=>{
    const matches=filter==='All' || card.dataset.category===filter;
    card.classList.toggle('hidden',!matches);
  });
}

function renderProductCards(products){
  if(!productsGrid || !Array.isArray(products) || products.length === 0) return;

  // Reset grid (homepage only) and render cards from DB.
  productsGrid.innerHTML = products.map((product, index) => `
    <article class="prod-card reveal ${index % 4 === 0 ? '' : index % 4 === 1 ? 'reveal-delay-1' : index % 4 === 2 ? 'reveal-delay-2' : 'reveal-delay-3'}" data-name="${product.name}" data-price="${product.price}" data-category="${product.category || 'Jewelry'}">
      <div class="prod-img-wrap" style="background:linear-gradient(145deg,#FDF0F2,#FAE8EB);">
        <div class="prod-img-art">✦</div>
        <div class="prod-badge ${product.badge === 'New' ? 'new' : ''}">${product.badge || 'Featured'}</div>
        <div class="prod-actions">
          <button class="prod-add">Add to Bag</button>
          <button class="prod-wish" aria-label="Add to wishlist"><svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>
        </div>
      </div>
      <div class="prod-name">${product.name}</div>
      <div class="prod-material">${product.material || 'Handcrafted gemstone jewelry'}</div>
      <div class="prod-price"><span class="prod-price-now">${formatPrice(product.price)}</span></div>
      <div class="prod-stars"><span>★★★★★</span></div>
    </article>
  `).join('');

  productCards = document.querySelectorAll('.prod-card');
  filterButtons = document.querySelectorAll('.feat-filter');

  // Re-bind events and ensure the section shows ALL products by default.
  bindProductCardEvents();
  if(filterButtons && filterButtons.length) bindFilterButtons();
  applyFilter('All');
}



function bindProductCardEvents(){
  productCards.forEach(card => {
    const addBtn = card.querySelector('.prod-add');
    if (addBtn) {
      addBtn.onclick = () => addToCart(card);
    }
  });
}

function bindFilterButtons(){
  filterButtons.forEach(button => {
    button.onclick = () => {
      filterButtons.forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      applyFilter(button.dataset.filter);
    };
  });
}

async function hydrateProductsFromApi(){
  if(!productsGrid) return;

  const loadingCard = document.getElementById('handpickedLoading');
  if (loadingCard) loadingCard.style.display = 'flex';

  try {
    const products = await fetchProductsFromApi();

    if (!Array.isArray(products) || products.length === 0) {
      console.warn('No products returned from /api/products');
      if (loadingCard) loadingCard.textContent = 'No products available right now.';
      return;
    }

    if (loadingCard) loadingCard.remove();
    renderProductCards(products);
  } catch (error) {
    console.warn('Unable to refresh products from API:', error);
    if (loadingCard) loadingCard.textContent = 'Unable to load products right now.';
  }
}

function addToCart(card){
  const name=card.dataset.name;
  const price=parseInt(card.dataset.price,10);
  const category=card.dataset.category;
  const existing=cart.find(item=>item.name===name);

  if(existing){
    existing.quantity += 1;
  } else {
    cart.push({name,price,category,quantity:1});
  }

  saveCart();
  updateCartUI();

  const button=card.querySelector('.prod-add');
  button.textContent='Added';
  button.disabled=true;
  setTimeout(()=>{
    button.textContent='Add to Bag';
    button.disabled=false;
  },1500);
}

function adjustQuantity(name,delta){
  const item=cart.find(entry=>entry.name===name);
  if(!item){return;}
  item.quantity += delta;
  if(item.quantity <= 0){
    cart=cart.filter(entry=>entry.name!==name);
  }
  saveCart();
  updateCartUI();
}

function removeItem(name){
  cart=cart.filter(item=>item.name!==name);
  saveCart();
  updateCartUI();
}

function updateLoginStatus(){
  if(currentUser){
    guestMode=false;
    loginStatus.textContent=`Logged in as ${currentUser.name}. Your cart and delivery details are ready to place.`;
    checkoutEmail.value=currentUser.email;
    customerName.value=currentUser.name;
  } else if(guestMode){
    loginStatus.textContent='Guest checkout active. Sign in to save your details and faster order history.';
  } else {
    loginStatus.textContent='Guest checkout is active. Log in to save your order details.';
  }

  const statusMessage=orderStatusBox.querySelector('.status-message');
  statusMessage.textContent=currentUser ? `Welcome back ${currentUser.name}! Your order is ready for checkout.` : 'Add products and finish shipping details to place your order.';
}

function submitLogin(event){
  event.preventDefault();
  const email=document.getElementById('customerEmail').value.trim();
  const password=document.getElementById('customerPassword').value.trim();

  if(!email || !password){
    loginStatus.textContent='Please enter both email and password to continue.';
    return;
  }

  currentUser={name:email.split('@')[0], email};
  guestMode=false;
  saveUser();
  updateLoginStatus();
  checkoutEmail.value=email;
  customerName.value=currentUser.name;
}

function enableGuestCheckout(){
  currentUser=null;
  guestMode=true;
  saveUser();
  updateLoginStatus();
}

function handleCheckoutSubmit(event){
  event.preventDefault();

  if(cart.length===0){
    orderStatusBox.querySelector('.status-message').textContent='Your cart is empty. Add products before checkout.';
    orderStatusBox.classList.remove('success');
    return;
  }

  if(!currentUser && !guestMode){
    orderStatusBox.querySelector('.status-message').textContent='Please log in or use guest checkout before placing your order.';
    orderStatusBox.classList.remove('success');
    document.getElementById('customerLogin').scrollIntoView({behavior:'smooth'});
    return;
  }

  const name=customerName.value.trim();
  const phone=customerPhone.value.trim();
  const address=customerAddress.value.trim();
  const city=customerCity.value.trim();
  const pincode=customerPincode.value.trim();

  if(!name || !phone || !address || !city || !pincode){
    orderStatusBox.querySelector('.status-message').textContent='Please complete all required shipping fields before placing the order.';
    orderStatusBox.classList.remove('success');
    return;
  }

  const orderId=`ZIV-${Date.now().toString().slice(-6)}`;
  const subtotal=cart.reduce((sum,item)=>sum + item.price*item.quantity,0);
  const shipping=subtotal >= 2000 ? 0 : 149;
  const total=subtotal + shipping;

  orderStatusBox.classList.add('success');
  orderStatusBox.querySelector('.status-title').textContent='Order confirmed';
  orderStatusBox.querySelector('.status-message').innerHTML=`<strong>Order ${orderId}</strong> has been placed for ${cart.length} item${cart.length===1?'':'s'}. Delivery to ${address}, ${city}, ${pincode}. Estimated total ${formatPrice(total)}.`;

  cart=[];
  saveCart();
  updateCartUI();
  checkoutForm.reset();
  if(currentUser){
    checkoutEmail.value=currentUser.email;
    customerName.value=currentUser.name;
  }
}

function resetCheckoutForm(){
  checkoutForm.reset();
  orderStatusBox.classList.remove('success');
  orderStatusBox.querySelector('.status-title').textContent='Current status';
  orderStatusBox.querySelector('.status-message').textContent='Add products and finish shipping details to place your order.';
}

cart=loadCart();
currentUser=loadUser();

if(hasCheckoutUI){
  updateCartUI();
  updateLoginStatus();
  loginForm.addEventListener('submit',submitLogin);
  guestCheckoutBtn.addEventListener('click',enableGuestCheckout);
  checkoutForm.addEventListener('submit',handleCheckoutSubmit);
  clearFormBtn.addEventListener('click',resetCheckoutForm);
  cartToggle.addEventListener('click',()=>{
    document.getElementById('commerce-flow').scrollIntoView({behavior:'smooth'});
  });
  loginToggle.addEventListener('click',()=>{
    document.getElementById('customerLogin').scrollIntoView({behavior:'smooth'});
    document.getElementById('customerEmail').focus();
  });
}

if(hasHomepageCommerce){
  bindFilterButtons();
  bindProductCardEvents();
  hydrateProductsFromApi();
}


/* ── PARALLAX HERO ── */
window.addEventListener('scroll',()=>{
  const y=window.scrollY;
  const heroGem=document.querySelector('.hero-gem');
  if(heroGem) heroGem.style.transform=`translate(-50%,calc(-50% + ${y*.18}px))`;
});

/* ── HERO VIDEO AUTOPLAY SAFEGUARD (mobile) ── */
window.addEventListener('DOMContentLoaded',()=>{
  const video=document.querySelector('.hero-video');
  if(!video) return;

  // Some mobile browsers may ignore autoplay attributes until JS explicitly calls play().
  // Keep muted so autoplay is allowed.
  const tryPlay=async()=>{
    try{
      // Re-assign playsInline behavior in case of any DOM parsing differences.
      video.playsInline = true;
      video.muted = true;

      const p=video.play();
      if(p && typeof p.catch === 'function') await p.catch(()=>{});
    } catch(e){
      // Ignore autoplay blocking errors.
    }
  };

  // Try immediately and again after a short delay (helps after preloader removal).
  tryPlay();
  setTimeout(()=>tryPlay(), 600);
});
