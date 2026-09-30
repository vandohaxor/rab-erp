'use strict';

const dayjs = require('dayjs');
require('dayjs/locale/id');
dayjs.locale('id');
const { BULAN, HARI } = require('./constants');

const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function money(value) {
  const num = Number(value || 0);
  return rupiah.format(Number.isFinite(num) ? num : 0);
}

function plainMoney(value) {
  return new Intl.NumberFormat('id-ID').format(Number(value || 0));
}

function date(value, format = 'DD MMM YYYY') {
  if (!value) return '-';
  const d = dayjs(value);
  return d.isValid() ? d.format(format) : '-';
}

function dateTime(value) {
  return date(value, 'DD/MM/YYYY HH:mm');
}

function time(value) {
  return value ? String(value).slice(0, 5) : '-';
}

function dayName(value) {
  const d = dayjs(value);
  return d.isValid() ? HARI[d.day()] : '-';
}

function monthName(value) {
  const num = Number(value);
  return BULAN[num - 1] || '-';
}

function monthYear(value) {
  const d = dayjs(value);
  return d.isValid() ? `${d.format('MMMM')} ${d.format('YYYY')}` : '-';
}

function today() {
  return dayjs().format('YYYY-MM-DD');
}

function nowTime() {
  return dayjs().format('HH:mm');
}

/** "08:15" -> 495 */
function timeToMinutes(value) {
  if (!value) return null;
  const [h, m] = String(value).slice(0, 5).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** 495 -> "08:15" */
function minutesToTime(minutes) {
  const total = Number(minutes || 0);
  if (!Number.isFinite(total) || total < 0) return '00:00';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 375 -> "6j 15m" */
function duration(minutes) {
  const total = Number(minutes || 0);
  if (!Number.isFinite(total) || total <= 0) return '-';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}j ${m}m` : `${h}j`;
}

/** "08:15" -> "08.15" agar mudah dibaca di tabel */
function dotTime(value) {
  if (!value) return '-';
  return String(value).slice(0, 5).replace(':', '.');
}

function percent(numerator, denominator, digits = 1) {
  const a = Number(numerator || 0);
  const b = Number(denominator || 0);
  if (!b) return 0;
  return Number(((a / b) * 100).toFixed(digits));
}

function capitalize(text) {
  const value = String(text || '');
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function titleCase(text) {
  return capitalize(String(text || '').replace(/[_-]+/g, ' '));
}

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

/** 1234567 -> "1.234.567" (dipakai pada input angka) */
function toPlainInput(value) {
  if (value === null || value === undefined || value === '') return '';
  return new Intl.NumberFormat('id-ID').format(Number(value));
}

/** "1.234.567" -> 1234567 */
function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : 0;
  if (value === null || value === undefined || value === '') return 0;
  const digits = String(value).replace(/[^\d-]/g, '');
  const num = Number(digits);
  return Number.isFinite(num) ? Math.trunc(num) : 0;
}

/** Ambil nama file dari path unggahan, untuk ditampilkan sebagai label tautan. */
function basename(filePath) {
  if (!filePath) return '-';
  return String(filePath).split(/[\\/]/).pop();
}

function isEmpty(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

module.exports = {
  dayjs,
  money,
  plainMoney,
  date,
  dateTime,
  time,
  dayName,
  monthName,
  monthYear,
  today,
  nowTime,
  timeToMinutes,
  minutesToTime,
  duration,
  dotTime,
  percent,
  capitalize,
  titleCase,
  initials,
  toPlainInput,
  toNumber,
  basename,
  isEmpty,
};
