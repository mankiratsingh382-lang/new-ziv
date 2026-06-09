/* ── PRELOADER ── */
window.addEventListener('load',()=>{
  setTimeout(()=>{
    document.getElementById('preloader').classList.add('gone');
    document.body.style.overflow='';
  },2000);
});
document.body.style.overflow='hidden';

/* ── CURSOR ── */
const cur=document.getElementById('cur');
const curR=document.getElementById('cur-r');
let mx=0,my=0,rx=0,ry=0;
document.addEventListener('mousemove',e=>{
  mx=e.clientX;my=e.clientY;
  cur.style.left=mx+'px';cur.style.top=my+'px';
});
function animRing(){
  rx+=(mx-rx)*.12;ry+=(my-ry)*.12;
  curR.style.left=rx+'px';curR.style.top=ry+'px';
  requestAnimationFrame(animRing);
}
animRing();
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

// If user is logged in on dashboard/login page, optionally reflect login state on homepage.
// (No redirects here; this script is used by multiple pages.)


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
const productCards=document.querySelectorAll('.prod-card');
const filterButtons=document.querySelectorAll('.feat-filter');

let cart=[];
let currentUser=null;
let guestMode=false;

function formatPrice(value){
  return `₹${value.toLocaleString('en-IN')}`;
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
updateCartUI();
updateLoginStatus();
applyFilter('All');

filterButtons.forEach(button=>{
  button.addEventListener('click',()=>{
    filterButtons.forEach(item=>item.classList.remove('active'));
    button.classList.add('active');
    applyFilter(button.dataset.filter);
  });
});

productCards.forEach(card=>{
  card.querySelector('.prod-add').addEventListener('click',()=>addToCart(card));
});

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

/* ── PARALLAX HERO ── */
window.addEventListener('scroll',()=>{
  const y=window.scrollY;
  const heroGem=document.querySelector('.hero-gem');
  if(heroGem) heroGem.style.transform=`translate(-50%,calc(-50% + ${y*.18}px))`;
});