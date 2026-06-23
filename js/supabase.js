/* ============================================================
   supabase.js — สร้าง client + ตัวช่วยล็อกอิน (window.OZLAuth)
   โหลดหลังสคริปต์ @supabase/supabase-js (CDN) และหลัง supabase-config.js
   ถ้ายังไม่ได้ตั้งค่า config → window.OZLAuth = null (แอปเป็นโหมด local)
   ============================================================ */
(function () {
  var url = window.OZL_SUPABASE_URL;
  var key = window.OZL_SUPABASE_ANON_KEY;
  var ok  = !!(url && key && window.supabase && window.supabase.createClient);

  window.OZL_CLOUD = ok;
  if (!ok) { window.OZLAuth = null; window.sbClient = null; return; }

  var client = window.supabase.createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  window.sbClient = client;

  window.OZLAuth = {
    client: client,
    signUp: function (email, password, meta) {
      return client.auth.signUp({ email: email, password: password, options: { data: meta || {} } });
    },
    signIn: function (email, password) {
      return client.auth.signInWithPassword({ email: email, password: password });
    },
    signOut: function () { return client.auth.signOut(); },
    getSession: function () { return client.auth.getSession(); },
    onChange: function (cb) { return client.auth.onAuthStateChange(cb); },
    resetPassword: function (email, redirectTo) {
      return client.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo: redirectTo } : undefined);
    },
  };
})();
