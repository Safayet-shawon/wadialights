import { boot } from './common.js';
import { initForms } from '../forms.js';
import { BUSINESS } from '../../server/lib/business.js';

boot('contact');
const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
set('c-address', (e) => { e.textContent = BUSINESS.address; });
set('c-map', (e) => { e.href = BUSINESS.map; });
set('c-phone', (e) => { e.href = `tel:${BUSINESS.phoneTel}`; e.textContent = BUSINESS.phoneDisplay; });
set('c-wa', (e) => { e.href = `https://wa.me/${BUSINESS.whatsapp}`; });
set('c-fb', (e) => { e.href = BUSINESS.facebook; });
set('c-ms', (e) => { e.href = BUSINESS.messenger; });
initForms();
