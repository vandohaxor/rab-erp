'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
  const methodOverride = require('method-override');
  const expressLayouts = require('express-ejs-layouts');

const env = require('./config/env');
const SqliteStore = require('./session/sqlite-session-store');
const h = require('./utils/helpers');
const {
  BULAN, ROLES, ROLE_LIST, ROLE_META, STATUS_ABSENSI, STATUS_KARYAWAN,
  STATUS_PAYROLL, METODE_PEMBAYARAN, TIPE_KONTRAK, JENIS_IZIN, AUDIT_LABEL,
  AUDIT_META, can,
} = require('./utils/constants');
const settingsService = require('./services/settings.service');

function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(env.rootDir, 'views'));
  app.set('layout', 'layouts/main');
  app.set('layout extractScripts', true);
  app.set('layout extractStyles', true);
  app.use(expressLayouts);

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));
  app.use(compression());
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(express.json({ limit: '2mb' }));
  app.use(methodOverride('_method'));
  app.use(express.static(path.join(env.rootDir, 'public'), { maxAge: env.isProd ? '7d' : 0 }));

  app.set('sessionName', env.session.name);
  app.use(session({
    name: env.session.name,
    secret: env.session.secret,
    store: new SqliteStore({ ttl: env.session.maxAge }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.isProd,
      maxAge: env.session.maxAge,
    },
  }));

  if (!env.isProd) app.use(morgan('dev'));
  else app.use(morgan('combined'));

  app.use((req, res, next) => {
    req.clientIp = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim()
      || req.socket?.remoteAddress
      || null;
    next();
  });

  // Helper yang tersedia di seluruh view.
  app.use((req, res, next) => {
    res.locals.app = {
      nama: env.companyName,
      tahun: new Date().getFullYear(),
    };
    res.locals.h = h;
    res.locals.company = settingsService.perusahaan();
    res.locals.BULAN = BULAN;
    res.locals.ROLES = ROLES;
    res.locals.ROLE_LIST = ROLE_LIST;
    res.locals.ROLE_META = ROLE_META;
    res.locals.STATUS_ABSENSI = STATUS_ABSENSI;
    res.locals.STATUS_KARYAWAN = STATUS_KARYAWAN;
    res.locals.STATUS_PAYROLL = STATUS_PAYROLL;
    res.locals.METODE_PEMBAYARAN = METODE_PEMBAYARAN;
    res.locals.TIPE_KONTRAK = TIPE_KONTRAK;
    res.locals.JENIS_IZIN = JENIS_IZIN;
    res.locals.AUDIT_LABEL = AUDIT_LABEL;
    res.locals.AUDIT_META = AUDIT_META;
    res.locals.can = can;
    res.locals.user = null;
    res.locals.flash = req.session.flash || null;
    res.locals.currentPath = req.path;
    res.locals.query = req.query;
    res.locals.clientIp = req.clientIp;
    if (req.session.flash) delete req.session.flash;
    next();
  });

  // routes
  app.use(require('./routes/auth.routes'));
  app.use('/', require('./routes/dashboard.routes'));
  app.use('/karyawan', require('./routes/karyawan.routes'));
  app.use('/users', require('./routes/user.routes'));
  app.use('/absensi', require('./routes/absensi.routes'));
  app.use('/pengajuan', require('./routes/pengajuan.routes'));
  app.use('/keuangan', require('./routes/keuangan.routes'));
  app.use('/payroll', require('./routes/payroll.routes'));
  app.use('/laporan', require('./routes/laporan.routes'));
  app.use('/pengaturan', require('./routes/pengaturan.routes'));
  app.use('/', require('./routes/profile.routes'));

  app.use((req, res) => {
    res.status(404).render('errors/404', { title: 'Halaman Tidak Ditemukan' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    const status = error.statusCode || error.status || 500;
    if (status >= 500) console.error('[ERROR]', error);
    const flashType = status === 403 ? 'danger' : status === 404 ? 'warning' : 'danger';
    if (req.accepts('html')) {
      if (status === 500 && env.isProd) {
        return res.status(500).render('errors/500', { title: 'Terjadi Kesalahan' });
      }
      req.session.flash = { type: flashType, message: error.message || 'Terjadi kesalahan pada server.' };
      const back = req.get('Referrer');
      return back ? res.redirect(back) : res.redirect('/');
    }
    return res.status(status).json({ error: error.message });
  });

  return app;
}

module.exports = { createApp };
