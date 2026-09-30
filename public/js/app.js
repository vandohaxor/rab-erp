/* Helper global PT Rajawali Atas Bumi */
(function () {
  'use strict';

  // Konfirmasi sebelum aksi destruktif
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (form.matches('[data-confirm]') && !window.confirm(form.getAttribute('data-confirm'))) {
      e.preventDefault();
    }
  });

  // Format input uang: ketik 5000000 -> tampil "5.000.000"
  function formatRupiahInput(input) {
    var raw = input.value.replace(/[^\d]/g, '');
    input.value = raw === '' ? '' : new Intl.NumberFormat('id-ID').format(Number(raw));
    input.dataset.rawValue = raw;
  }

  document.querySelectorAll('input[data-rupiah]').forEach(function (input) {
    formatRupiahInput(input);
    input.addEventListener('input', function () { formatRupiahInput(input); });

    // Nama field dipindah ke input tersembunyi agar server hanya menerima
    // angka polos (input yang terlihat memakai nama berbeda).
    var name = input.getAttribute('name');
    var carrier = document.createElement('input');
    carrier.type = 'hidden';
    carrier.name = name;
    input.removeAttribute('name');
    input.parentNode.insertBefore(carrier, input);

    var sync = function () { carrier.value = input.dataset.rawValue || '0'; };
    input.addEventListener('input', sync);
    input.addEventListener('blur', sync);
    if (input.form) input.form.addEventListener('submit', sync);
    sync();
  });

  // Kirim GET otomatis saat filter berubah
  document.querySelectorAll('[data-auto-submit]').forEach(function (el) {
    el.addEventListener('change', function () {
      if (el.form) el.form.submit();
    });
  });

  // Filter pencarian tabel dengan delay
  document.querySelectorAll('input[data-search-table]').forEach(function (input) {
    var targetId = input.getAttribute('data-search-table');
    var rows = document.querySelectorAll('#' + targetId + ' tbody tr');
    input.addEventListener('input', function () {
      var q = input.value.toLowerCase().trim();
      rows.forEach(function (row) {
        row.style.display = !q || row.textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
      });
    });
  });

  // Tampilkan / sembunyikan password (data-password-plain)
  var MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
  document.querySelectorAll('[data-toggle-password]').forEach(function (btn) {
    var target = btn.parentNode.querySelector('[data-password-plain]');
    if (!target) return;
    btn.addEventListener('click', function () {
      var tampil = btn.getAttribute('data-tampil') !== '1';
      btn.setAttribute('data-tampil', tampil ? '1' : '0');
      target.textContent = tampil ? target.getAttribute('data-password-plain') : MASK;
      var icon = btn.querySelector('i');
      if (icon) icon.className = 'bi bi-eye' + (tampil ? '-slash' : '');
      var label = btn.childNodes[btn.childNodes.length - 1];
      if (label && label.nodeType === 3) label.nodeValue = tampil ? ' Sembunyikan' : ' Tampilkan';
    });
  });

  // Jam digital pada panel absensi
  var clock = document.querySelector('[data-clock]');
  if (clock) {
    var tick = function () {
      var now = new Date();
      clock.textContent = now.toTimeString().slice(0, 8);
    };
    tick();
    setInterval(tick, 1000);
  }

  // Konfirmasi sebelum unload bila form belum tersimpan
  document.querySelectorAll('form[data-dirty-guard]').forEach(function (form) {
    var dirty = false;
    form.addEventListener('input', function () { dirty = true; });
    form.addEventListener('submit', function () { dirty = false; });
    window.addEventListener('beforeunload', function (event) {
      if (dirty) { event.preventDefault(); event.returnValue = ''; }
    });
  });

  // Tooltip
  if (window.bootstrap && bootstrap.Tooltip) {
    document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function (el) {
      new bootstrap.Tooltip(el);
    });
  }
})();
