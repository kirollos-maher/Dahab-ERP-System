/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/11-realtime.js
   محرك التحديثات المباشرة (Realtime WebSocket):
     - الاشتراك في قنوات Supabase Realtime
     - معالجة أحداث كل جدول (sales / inventory / ledger / shifts / prices / repairs)
     - سجل الأحداث الحية (Live Activity Feed)
     - إشعارات فورية للأحداث المهمة
     - محاكي تلقائي (opt-in) عند عدم وجود Supabase
     - إعادة الاتصال التلقائي (Exponential Backoff)
     - منع التكرار (Event Deduplication)
     - Form-aware: لا يُعيد التصيير أثناء الكتابة في الحقول
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · REALTIME STATE
     ═════════════════════════════════════════════════════════════════════ */
  const RTState = {
    /* الاتصال */
    channel: null,
    channelName: null,
    channelStatus: 'idle',
    connectedAt: null,

    /* إعادة الاتصال */
    reconnectAttempts: 0,
    reconnectTimer: null,
    maxReconnectAttempts: 10,

    /* إحصائيات */
    stats: {
      totalEvents: 0,
      totalReconnects: 0,
      totalErrors: 0,
      lastEventAt: null,
      lastEventType: null,
      eventsByTable: {},
      eventsByAction: {},
    },

    /* سجل الأحداث الحي */
    feed: [],
    maxFeedSize: 100,

    /* منع التكرار */
    processedEvents: new Set(),
    dedupWindowMs: 5000,

    /* المحاكي التجريبي */
    demoTimer: null,
    demoRunning: false,

    /* الإيقاف المؤقت */
    paused: false,

    /* المستمعون */
    listeners: {
      event: new Set(),
      connectionChange: new Set(),
      feedUpdate: new Set(),
      error: new Set(),
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §2 · EVENT EMITTER
     ═════════════════════════════════════════════════════════════════════ */
  function emit(event, data) {
    const set = RTState.listeners[event];
    if (!set) return;
    set.forEach(fn => {
      try { fn(data); } catch (e) { console.error(`[RT.emit:${event}]`, e); }
    });
  }

  function on(event, fn) {
    const set = RTState.listeners[event];
    if (!set || typeof fn !== 'function') return () => {};
    set.add(fn);
    return () => set.delete(fn);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · EVENT META (لكل جدول)
     ═════════════════════════════════════════════════════════════════════ */
  const EVENT_META = {
    /* Sales */
    'sales.INSERT': {
      icon: 'receipt',
      cls: 'sale',
      label: 'فاتورة بيع',
      significant: true,
      toast: true,
      color: 'success',
    },
    'sales.UPDATE': {
      icon: 'pencil',
      cls: 'update',
      label: 'تحديث فاتورة',
      significant: false,
    },
    'sales.DELETE': {
      icon: 'trash-2',
      cls: 'alert',
      label: 'حذف فاتورة',
      significant: true,
      toast: true,
      color: 'danger',
    },

    /* Inventory */
    'inventory.INSERT': {
      icon: 'package-plus',
      cls: 'stock',
      label: 'صنف جديد',
      significant: false,
    },
    'inventory.UPDATE': {
      icon: 'package',
      cls: 'stock',
      label: 'تحديث صنف',
      significant: false,
    },
    'inventory.DELETE': {
      icon: 'package-x',
      cls: 'alert',
      label: 'حذف صنف',
      significant: true,
      color: 'warn',
    },

    /* Ledger */
    'entity_ledger.INSERT': {
      icon: 'scale',
      cls: 'ledger',
      label: 'حركة دفتر',
      significant: false,
    },

    /* Shifts */
    'shifts.INSERT': {
      icon: 'play-circle',
      cls: 'shift',
      label: 'بدء وردية',
      significant: false,
    },
    'shifts.UPDATE': {
      icon: 'lock',
      cls: 'shift',
      label: 'تحديث وردية',
      significant: false,
    },

    /* Price board */
    'price_board.INSERT': {
      icon: 'trending-up',
      cls: 'price',
      label: 'سعر جديد',
      significant: true,
      toast: true,
      color: 'primary',
    },
    'price_board.UPDATE': {
      icon: 'trending-up',
      cls: 'price',
      label: 'تحديث سعر',
      significant: true,
      toast: true,
      color: 'primary',
    },

    /* Returns */
    'returns.INSERT': {
      icon: 'rotate-ccw',
      cls: 'return',
      label: 'مرتجع',
      significant: false,
    },
    'returns.UPDATE': {
      icon: 'undo-2',
      cls: 'return',
      label: 'تحديث مرتجع',
      significant: false,
    },

    /* Repairs — الصيانة */
    'repairs.INSERT': {
      icon: 'wrench',
      cls: 'sale',
      label: 'تكت صيانة جديد',
      significant: false,
    },
    'repairs.UPDATE': {
      icon: 'wrench',
      cls: 'update',
      label: 'تحديث تكت صيانة',
      significant: false,
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §4 · FEED ENGINE
     ═════════════════════════════════════════════════════════════════════ */
  const Feed = {

    add(event) {
      if (!event) return null;

      if (RTState.feed.length >= RTState.maxFeedSize) {
        RTState.feed = RTState.feed.slice(0, RTState.maxFeedSize - 1);
      }

      RTState.feed.unshift(event);

      try {
        const persisted = RTState.feed.slice(0, 30);
        localStorage.setItem(GMS.LS_KEYS.FEED, JSON.stringify(persisted));
      } catch (_) {}

      emit('feedUpdate', event);
      return event;
    },

    getAll(filters = {}) {
      const { table = '', limit = 50 } = filters;
      let rows = RTState.feed;

      if (table) {
        rows = rows.filter(e => e.table === table);
      }

      return rows.slice(0, limit);
    },

    clear() {
      RTState.feed = [];
      try {
        localStorage.removeItem(GMS.LS_KEYS.FEED);
      } catch (_) {}
      emit('feedUpdate', null);
    },

    load() {
      try {
        const stored = localStorage.getItem(GMS.LS_KEYS.FEED);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            RTState.feed = parsed;
          }
        }
      } catch (_) {}
    },

    count() {
      return RTState.feed.length;
    },

    latest() {
      return RTState.feed[0] || null;
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §5 · DEDUPLICATION
     ═════════════════════════════════════════════════════════════════════ */
  const Dedup = {

    _key(payload) {
      if (!payload) return '';

      const table = payload.table || '';
      const type = payload.eventType || '';
      const row = payload.new || payload.old || {};
      const id = row.id || '';
      const updatedAt = row.updated_at || row.created_at || '';

      return `${table}:${type}:${id}:${updatedAt}`;
    },

    isDuplicate(payload) {
      const key = this._key(payload);
      if (!key) return false;

      if (RTState.processedEvents.has(key)) {
        return true;
      }

      RTState.processedEvents.add(key);

      if (RTState.processedEvents.size > 500) {
        const arr = Array.from(RTState.processedEvents);
        RTState.processedEvents = new Set(arr.slice(-200));
      }

      return false;
    },

    clear() {
      RTState.processedEvents.clear();
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §6 · NOTIFICATION ENGINE
     ═════════════════════════════════════════════════════════════════════ */
  const Notifier = {

    notify(event) {
      if (!event || !event.meta) return;
      if (!event.meta.toast) return;

      if (event.isSelf) return;

      /* ✅ تجاهل الإشعارات إذا كان هناك Modal مفتوح */
      if (GMS.Modal && typeof GMS.Modal.count === 'function' && GMS.Modal.count() > 0) {
        return;
      }

      /* ✅ تجاهل الإشعارات إذا كان المستخدم يكتب في حقل */
      const active = document.activeElement;
      if (active) {
        const tag = active.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
          return;
        }
      }

      const { meta, title, description, amount } = event;

      const desc = [description, amount]
        .filter(Boolean)
        .join(' · ');

      const type = meta.color === 'danger' ? 'err'
                 : meta.color === 'warn' ? 'warn'
                 : meta.color === 'success' ? 'ok'
                 : 'info';

      GMS.Toast.show({
        title,
        desc,
        type,
        icon: meta.icon,
        ms: 4200,
      });
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §7 · EVENT HANDLERS
     ═════════════════════════════════════════════════════════════════════ */

  async function handleRealtimeEvent(payload) {
    if (!payload) return;

    if (RTState.paused) return;

    if (Dedup.isDuplicate(payload)) {
      return;
    }

    const table = payload.table;
    const action = payload.eventType;
    const row = action === 'DELETE' ? payload.old : payload.new;

    if (!row) return;

    /* تحديث الإحصائيات */
    RTState.stats.totalEvents++;
    RTState.stats.lastEventAt = new Date().toISOString();
    RTState.stats.lastEventType = `${table}.${action}`;
    RTState.stats.eventsByTable[table] = (RTState.stats.eventsByTable[table] || 0) + 1;
    RTState.stats.eventsByAction[action] = (RTState.stats.eventsByAction[action] || 0) + 1;

    /* بناء الحدث */
    const event = buildEvent(table, action, row, payload.old, payload);

    /* إضافة للسجل */
    Feed.add(event);

    /* إشعار */
    Notifier.notify(event);

    /* إبطال الذاكرة المؤقتة */
    if (GMS.Cache && GMS.Cache.handleRealtimeInvalidation) {
      try {
        await GMS.Cache.handleRealtimeInvalidation({
          table,
          action,
          id: row.id,
          row,
        });
      } catch (e) {
        console.warn('[RT] Cache invalidation failed:', e);
      }
    }

    /* إبلاغ المستمعين */
    emit('event', event);

    /* ✅ إعادة تصيير الصفحة الحالية — مع فحص Form + Modal */
    if (GMS.Router && shouldRerender(table)) {
      try {
        GMS.Router.scheduleRerender();
      } catch (_) {}
    }
  }

  /**
   * بناء حدث مُعالَج من payload
   */
  function buildEvent(table, action, row, old, payload) {
    const metaKey = `${table}.${action}`;
    const meta = EVENT_META[metaKey] || {
      icon: 'activity',
      cls: 'update',
      label: 'تحديث',
      significant: false,
    };

    const builder = EVENT_BUILDERS[table] || EVENT_BUILDERS.default;
    const built = builder(row, action, old, payload);

    return {
      id: GMS.uid(),
      table,
      action,
      row,
      old,
      payload,
      meta,
      title: built.title || meta.label,
      description: built.description || '',
      amount: built.amount || null,
      amountUnit: built.amountUnit || '',
      branchId: built.branchId || row.branch_id || null,
      userId: built.userId || row.created_by || null,
      isSelf: built.isSelf || false,
      significance: built.significance || meta.significant ? 'high' : 'low',
      timestamp: row.created_at || row.updated_at || new Date().toISOString(),
    };
  }

  /**
   * بناة الأحداث حسب الجدول
   */
  const EVENT_BUILDERS = {

    /* ═══ SALES ═══ */
    sales(row, action) {
      if (action === 'DELETE') {
        return {
          title: `حذف فاتورة ${row.sale_no || '#' + String(row.id).slice(0, 6)}`,
          description: row.customer_name || 'عميل نقدي',
          amount: GMS.moneyFmt(row.grand_total),
          amountUnit: ' ج.م',
        };
      }

      const isNew = action === 'INSERT';
      const customerName = row.customer_name || 'عميل نقدي';

      return {
        title: isNew
          ? `فاتورة ${row.sale_no || ''}`
          : `تحديث فاتورة ${row.sale_no || ''}`,
        description: `${customerName}${row.payment_method ? ' · ' + row.payment_method : ''}`,
        amount: GMS.moneyFmt(row.grand_total || 0),
        amountUnit: ' ج.م',
        significance: (row.grand_total || 0) > 15000,
      };
    },

    /* ═══ INVENTORY ═══ */
    inventory(row, action) {
      if (action === 'DELETE') {
        return {
          title: `حذف صنف ${row.sku || ''}`,
          description: `${row.karat || '?'}K · ${row.category || 'غير محدد'}`,
          amount: GMS.gramFmt(row.pure_weight || 0),
          amountUnit: ' جم',
        };
      }

      const isNew = action === 'INSERT';

      return {
        title: isNew
          ? `صنف جديد · ${row.sku || ''}`
          : `تحديث صنف · ${row.sku || ''}`,
        description: `${row.karat || '?'}K · ${row.category || 'غير محدد'}${row.manufacturer_name ? ' · ' + row.manufacturer_name : ''}`,
        amount: GMS.gramFmt(row.pure_weight || 0),
        amountUnit: ' جم',
        significance: (row.pure_weight || 0) > 20,
      };
    },

    /* ═══ LEDGER ═══ */
    entity_ledger(row) {
      const goldDelta = Number(row.gold_delta || 0);
      const cashDelta = Number(row.cash_delta || 0);

      const parts = [];
      if (Math.abs(goldDelta) > 0.001) {
        parts.push(`${goldDelta > 0 ? '+' : ''}${GMS.gramFmt(goldDelta)} جم`);
      }
      if (Math.abs(cashDelta) > 0.01) {
        parts.push(`${cashDelta > 0 ? '+' : ''}${GMS.moneyFmt(cashDelta)} ج.م`);
      }

      return {
        title: `حركة دفتر · ${row.entry_type || '—'}`,
        description: row.description || parts.join(' · '),
        amount: parts.join(' / '),
        amountUnit: '',
      };
    },

    /* ═══ SHIFTS ═══ */
    shifts(row, action) {
      const wasClosed = action === 'UPDATE' && row.status === 'CLOSED';

      if (wasClosed) {
        const variance = Number(row.cash_variance || 0) + Number(row.gold_variance || 0) * GMS.APP_CONFIG.DEFAULT_PRICE_24;

        return {
          title: `إغلاق وردية ${row.shift_no || ''}`,
          description: `${row.cashier_name || '—'} · فرق: ${GMS.moneyFmt(variance)} ج.م`,
          amount: GMS.moneyFmt(row.cash_sales || 0),
          amountUnit: ' ج.م',
          significance: Math.abs(variance) > 500,
        };
      }

      return {
        title: `وردية ${row.shift_no || ''}`,
        description: `${row.cashier_name || '—'} · ${row.status || '—'}`,
        amount: GMS.moneyFmt(row.cash_sales || 0),
        amountUnit: ' ج.م',
      };
    },

    /* ═══ PRICE BOARD ═══ */
    price_board(row, action) {
      return {
        title: action === 'INSERT' ? 'سعر جديد للذهب' : 'تحديث سعر الذهب',
        description: `24K: ${GMS.moneyFmt(row.price_24)} ج.م/جم`,
        amount: GMS.moneyFmt(row.price_24 || 0),
        amountUnit: ' ج.م',
        significance: true,
      };
    },

    /* ═══ RETURNS ═══ */
    returns(row, action) {
      const typeLabels = {
        customer_return: 'مرتجع عميل',
        buyback: 'شراء كسر',
        supplier_return: 'مرتجع مورد',
      };

      return {
        title: `${typeLabels[row.return_type] || 'مرتجع'} · ${row.return_no || ''}`,
        description: `${row.sku || ''} · ${row.karat || '?'}K`,
        amount: GMS.moneyFmt(row.refund_amount || row.credit_issued || 0),
        amountUnit: ' ج.م',
      };
    },

    /* ═══ REPAIRS ═══ */
    repairs(row, action) {
      if (action === 'DELETE') {
        return {
          title: `حذف تكت صيانة ${row.ticket_no || ''}`,
          description: row.customer_name || '—',
        };
      }

      const isNew = action === 'INSERT';
      const statusLabels = {
        RECEIVED: 'مستلم',
        IN_PROGRESS: 'قيد الصيانة',
        READY: 'جاهز',
        DELIVERED: 'مُسلَّم',
        CANCELLED: 'ملغى',
      };

      return {
        title: isNew
          ? `تكت صيانة جديد · ${row.ticket_no || ''}`
          : `تحديث تكت · ${row.ticket_no || ''}`,
        description: `${row.customer_name || '—'} · ${statusLabels[row.status] || row.status}`,
        amount: GMS.moneyFmt(row.grand_total || 0),
        amountUnit: ' ج.م',
        significance: row.is_suspicious === true,
      };
    },

    /* ═══ DEFAULT ═══ */
    default(row, action) {
      return {
        title: `${action} · ${row.id ? String(row.id).slice(0, 8) : 'unknown'}`,
        description: '',
      };
    },
  };

  /**
   * ✅ هل يجب إعادة تصيير الصفحة عند هذا الحدث؟
   *
   * يرفض إعادة التصيير إذا:
   *   1. كان هناك Modal مفتوح
   *   2. كان المستخدم يكتب في حقل (Input/Select/Textarea)
   *   3. كان هناك تفاعل حديث مع أي حقل (آخر 3 ثواني)
   *
   * @param {string} table
   * @returns {boolean}
   */
  function shouldRerender(table) {
    /* ✅ فحص 1: Modal مفتوح */
    if (GMS.Modal && typeof GMS.Modal.count === 'function' && GMS.Modal.count() > 0) {
      return false;
    }

    /* ✅ فحص 2: المستخدم يكتب في حقل */
    const active = document.activeElement;
    if (active) {
      const tag = active.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        return false;
      }
      if (active.isContentEditable) {
        return false;
      }
    }

    /* ✅ فحص 3: تفاعل حديث مع أي حقل (آخر 3 ثواني) */
    if (window.GMS && window.GMS._lastFormInteraction) {
      const elapsed = Date.now() - window.GMS._lastFormInteraction;
      if (elapsed < 3000) {
        return false;
      }
    }

    const currentRoute = GMS.Router?.currentId();

    const routesToTables = {
      dashboard: ['sales', 'inventory', 'entity_ledger', 'shifts', 'price_board'],
      pos: ['inventory'],
      inventory: ['inventory'],
      suppliers: ['entity_ledger'],
      returns: ['returns', 'inventory', 'sales'],
      analytics: ['sales', 'inventory'],
      audit: ['audit_logs'],
      queue: ['sales'],
      repair: ['repairs'],
      loss: ['melting_batches', 'polishing_batches', 'assay_records'],
    };

    const tables = routesToTables[currentRoute] || [];
    return tables.includes(table);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · SUBSCRIPTION MANAGEMENT
     ═════════════════════════════════════════════════════════════════════ */

  function subscribe() {
    if (!GMS.Supabase || !GMS.Supabase.isReady()) {
      console.log('[RT] Supabase not ready — checking demo simulator');
      setChannelStatus('idle', 'غير متصل');
      startDemoSimulator();   /* سيفحص opt-in داخلياً */
      return;
    }

    setChannelStatus('connecting');

    try {
      if (RTState.channel) {
        try {
          GMS.Supabase.get().removeChannel(RTState.channel);
        } catch (_) {}
        RTState.channel = null;
      }

      RTState.channelName = GMS.SUPABASE_CONFIG.REALTIME_CHANNELS.EXEC_DASHBOARD +
        '-' + Date.now();

      RTState.channel = GMS.Supabase.get()
        .channel(RTState.channelName, {
          config: {
            broadcast: { self: false },
          },
        })

        /* Sales */
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sales' },
          (payload) => handleRealtimeEvent({ ...payload, table: 'sales' })
        )

        /* Inventory */
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'inventory' },
          (payload) => handleRealtimeEvent({ ...payload, table: 'inventory' })
        )

        /* Entity Ledger */
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'entity_ledger' },
          (payload) => handleRealtimeEvent({ ...payload, table: 'entity_ledger' })
        )

        /* Shifts */
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'shifts' },
          (payload) => handleRealtimeEvent({ ...payload, table: 'shifts' })
        )

        /* Price Board */
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'price_board' },
          (payload) => handleRealtimeEvent({ ...payload, table: 'price_board' })
        )

        /* Returns */
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'returns' },
          (payload) => handleRealtimeEvent({ ...payload, table: 'returns' })
        )

        /* Repairs */
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'repairs' },
          (payload) => handleRealtimeEvent({ ...payload, table: 'repairs' })
        )

        /* حالة الاشتراك */
        .subscribe((status, err) => {
          handleSubscriptionStatus(status, err);
        });

      console.log('[RT] Subscription started:', RTState.channelName);

    } catch (e) {
      console.error('[RT] Subscribe failed:', e);
      setChannelStatus('error', e.message);
      emit('error', { error: e });
      scheduleReconnect();
    }
  }

  function unsubscribe() {
    if (RTState.channel && GMS.Supabase?.isReady()) {
      try {
        GMS.Supabase.get().removeChannel(RTState.channel);
      } catch (_) {}
      RTState.channel = null;
      RTState.channelName = null;
    }

    stopDemoSimulator();
    setChannelStatus('idle', 'غير متصل');
    clearReconnectTimer();
  }

  function handleSubscriptionStatus(status, err) {
    switch (status) {
      case 'SUBSCRIBED':
        RTState.reconnectAttempts = 0;
        RTState.connectedAt = new Date().toISOString();
        setChannelStatus('connected', 'مباشر · متصل');
        clearReconnectTimer();

        GMS.SyncLog?.add('success', 'Realtime متصل',
          `القناة: ${RTState.channelName}`);

        console.log('[RT] Subscribed successfully');
        break;

      case 'CHANNEL_ERROR':
        console.warn('[RT] Channel error:', err);
        RTState.stats.totalErrors++;
        setChannelStatus('error', 'خطأ في الاتصال');
        emit('error', { error: err });
        scheduleReconnect();
        break;

      case 'TIMED_OUT':
        console.warn('[RT] Timed out');
        RTState.stats.totalErrors++;
        setChannelStatus('error', 'انتهت المهلة');
        scheduleReconnect();
        break;

      case 'CLOSED':
        if (RTState.channelStatus !== 'error') {
          setChannelStatus('connecting', 'إعادة الاتصال…');
        }
        break;
    }
  }

  function scheduleReconnect() {
    if (RTState.reconnectTimer) return;

    if (RTState.reconnectAttempts >= RTState.maxReconnectAttempts) {
      console.warn('[RT] Max reconnect attempts reached');
      setChannelStatus('error', 'فشل الاتصال — أعد التحميل');
      return;
    }

    RTState.reconnectAttempts++;
    RTState.stats.totalReconnects++;

    const baseDelay = GMS.SYNC_CONFIG.RECONNECT_BASE_MS;
    const maxDelay = GMS.SYNC_CONFIG.RECONNECT_MAX_MS;
    const delay = Math.min(maxDelay, baseDelay * Math.pow(1.6, RTState.reconnectAttempts - 1));

    setChannelStatus('connecting',
      `إعادة الاتصال خلال ${Math.round(delay / 1000)} ث…`);

    console.log(`[RT] Reconnecting in ${delay}ms (attempt ${RTState.reconnectAttempts})`);

    RTState.reconnectTimer = setTimeout(() => {
      RTState.reconnectTimer = null;
      subscribe();
    }, delay);
  }

  function clearReconnectTimer() {
    if (RTState.reconnectTimer) {
      clearTimeout(RTState.reconnectTimer);
      RTState.reconnectTimer = null;
    }
  }

  function setChannelStatus(status, text) {
    RTState.channelStatus = status;
    emit('connectionChange', {
      status,
      text: text || '',
      connectedAt: RTState.connectedAt,
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · DEMO SIMULATOR (OPT-IN)
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * ✅ بدء المحاكي — فقط عند الطلب اليدوي
   *
   * التفعيل:
   *   window.ENABLE_DEMO_SIMULATOR = true;  (قبل التحميل)
   *   أو: localStorage.setItem('gms.demo.simulator', 'true');
   *
   * الإيقاف:
   *   localStorage.setItem('gms.demo.simulator', 'false');
   */
  function startDemoSimulator() {
    const enabled =
      window.ENABLE_DEMO_SIMULATOR === true ||
      localStorage.getItem('gms.demo.simulator') === 'true';

    if (!enabled) {
      console.log('[RT] 💤 Demo simulator disabled (opt-in mode)');
      console.log('[RT] 💡 To enable: localStorage.setItem("gms.demo.simulator", "true"); location.reload()');
      return;
    }

    if (RTState.demoRunning) return;

    RTState.demoRunning = true;
    RTState.connectedAt = new Date().toISOString();

    console.log('[RT] ✅ Demo simulator started (manual opt-in)');

    RTState.demoTimer = setInterval(() => {
      if (RTState.paused) return;
      generateDemoEvent();
    }, 5000 + Math.random() * 4000);

    setTimeout(() => {
      if (!RTState.paused) generateDemoEvent();
    }, 3000);
  }

  function stopDemoSimulator() {
    if (RTState.demoTimer) {
      clearInterval(RTState.demoTimer);
      RTState.demoTimer = null;
    }
    RTState.demoRunning = false;
    console.log('[RT] Demo simulator stopped');
  }

  /**
   * توليد حدث تجريبي عشوائي
   */
  function generateDemoEvent() {
    const rnd = Math.random();
    const now = new Date().toISOString();

    /* 55% فاتورة بيع */
    if (rnd < 0.55) {
      const pure = GMS.round(1.2 + Math.random() * 14, 4);
      const value = GMS.round(pure * GMS.APP_CONFIG.DEFAULT_PRICE_24 * (1.05 + Math.random() * 0.15), 2);

      const payload = {
        table: 'sales',
        eventType: 'INSERT',
        new: {
          id: GMS.uid(),
          sale_no: GMS.invoiceNo('INV'),
          grand_total: value,
          total_pure_weight: pure,
          customer_name: Math.random() < 0.4
            ? (GMS.Demo?.getCustomers()?.[Math.floor(Math.random() * 10)]?.name || 'عميل نقدي')
            : null,
          cashier_name: GMS.Demo?.getSalespeople()?.[Math.floor(Math.random() * 12)] || 'كاشير',
          payment_method: ['cash', 'cash', 'card', 'instapay'][Math.floor(Math.random() * 4)],
          branch_id: GMS.DEFAULT_BRANCHES[Math.floor(Math.random() * 3)].id,
          created_at: now,
        },
      };

      handleRealtimeEvent(payload);

    /* 20% تحديث مخزون */
    } else if (rnd < 0.75) {
      const karat = GMS.KARAT_ORDER[Math.floor(Math.random() * 5)];
      const ratio = GMS.karatRatio(karat);
      const net = GMS.round(1.5 + Math.random() * 8, 3);
      const pure = GMS.round(net * ratio, 4);
      const categories = GMS.CATEGORIES.slice(0, 10);
      const manu = GMS.Demo?.getManufacturers()?.[Math.floor(Math.random() * 6)];

      const payload = {
        table: 'inventory',
        eventType: 'INSERT',
        new: {
          id: GMS.uid(),
          sku: GMS.generateSKU({
            manufacturerCode: manu?.code || 'A',
            karat,
            seq: Math.floor(Math.random() * 10000),
          }),
          karat,
          purity_ratio: ratio,
          category: categories[Math.floor(Math.random() * categories.length)],
          net_weight: net,
          pure_weight: pure,
          status: 'IN_STOCK',
          manufacturer_code: manu?.code || 'A',
          manufacturer_name: manu?.name || 'مصنع',
          branch_id: GMS.DEFAULT_BRANCHES[Math.floor(Math.random() * 3)].id,
          created_at: now,
          updated_at: now,
        },
      };

      handleRealtimeEvent(payload);

    /* 15% دفتر موردين */
    } else if (rnd < 0.90) {
      const isGold = Math.random() < 0.6;
      const suppliers = GMS.Demo?.getSuppliers() || [];

      const payload = {
        table: 'entity_ledger',
        eventType: 'INSERT',
        new: {
          id: GMS.uid(),
          entity_type: 'supplier',
          entity_id: suppliers[Math.floor(Math.random() * suppliers.length)]?.id,
          entry_type: isGold ? 'gold_received' : 'cash_payment',
          gold_delta: isGold ? GMS.round((Math.random() - 0.4) * 30, 4) : 0,
          cash_delta: !isGold ? GMS.round((Math.random() - 0.4) * 80000, 2) : 0,
          description: isGold ? 'شحنة ذهب' : 'سداد نقدي',
          created_at: now,
        },
      };

      handleRealtimeEvent(payload);

    /* 5% تحديث سعر */
    } else if (rnd < 0.95) {
      const currentPrice = GMS.Cache?.getPrice()?.price_24 || GMS.APP_CONFIG.DEFAULT_PRICE_24;
      const newPrice = GMS.round(currentPrice + (Math.random() - 0.5) * 50, 2);

      const payload = {
        table: 'price_board',
        eventType: 'INSERT',
        new: {
          id: GMS.uid(),
          price_24: newPrice,
          effective_date: now,
          created_at: now,
        },
      };

      handleRealtimeEvent(payload);

    /* 5% إغلاق وردية */
    } else {
      const cashiers = GMS.Demo?.getSalespeople() || ['كاشير'];
      const variance = GMS.round((Math.random() - 0.5) * 800, 2);

      const payload = {
        table: 'shifts',
        eventType: 'UPDATE',
        new: {
          id: GMS.uid(),
          shift_no: 'SH-SIM-' + GMS.uid().toUpperCase().slice(0, 6),
          status: 'CLOSED',
          cash_variance: variance,
          gold_variance: 0,
          cash_sales: GMS.round(50000 + Math.random() * 150000, 2),
          cashier_name: cashiers[Math.floor(Math.random() * cashiers.length)],
          branch_id: GMS.DEFAULT_BRANCHES[Math.floor(Math.random() * 3)].id,
          closed_at: now,
        },
        old: { status: 'OPEN' },
      };

      handleRealtimeEvent(payload);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · MANUAL EMIT
     ═════════════════════════════════════════════════════════════════════ */

  async function emitEvent(table, action, row, old) {
    await handleRealtimeEvent({
      table,
      eventType: action,
      new: action === 'DELETE' ? undefined : row,
      old: action === 'DELETE' ? row : old,
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · STATISTICS
     ═════════════════════════════════════════════════════════════════════ */

  function getStats() {
    return {
      ...RTState.stats,
      status: RTState.channelStatus,
      reconnectAttempts: RTState.reconnectAttempts,
      connectedAt: RTState.connectedAt,
      feedSize: RTState.feed.length,
      demoRunning: RTState.demoRunning,
      paused: RTState.paused,
      dedupSize: RTState.processedEvents.size,
    };
  }

  function resetStats() {
    RTState.stats = {
      totalEvents: 0,
      totalReconnects: 0,
      totalErrors: 0,
      lastEventAt: null,
      lastEventType: null,
      eventsByTable: {},
      eventsByAction: {},
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · PAUSE / RESUME
     ═════════════════════════════════════════════════════════════════════ */

  function pause() {
    RTState.paused = true;
    console.log('[RT] Paused');
  }

  function resume() {
    RTState.paused = false;
    console.log('[RT] Resumed');
  }

  function toggle() {
    if (RTState.paused) {
      resume();
      return false;
    }
    pause();
    return true;
  }

  function isPaused() {
    return RTState.paused;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · INITIALIZATION
     ═════════════════════════════════════════════════════════════════════ */

  async function init(opts = {}) {
    const {
      autoSubscribe = true,
      loadFeed = true,
    } = opts;

    if (loadFeed) {
      Feed.load();
    }

    Dedup.clear();

    if (autoSubscribe) {
      setTimeout(() => subscribe(), 800);
    }

    console.log('[RT] Initialized', {
      status: RTState.channelStatus,
      feedSize: RTState.feed.length,
      demoSimulator:
        window.ENABLE_DEMO_SIMULATOR === true ||
        localStorage.getItem('gms.demo.simulator') === 'true',
    });

    return {
      status: RTState.channelStatus,
      feedSize: RTState.feed.length,
    };
  }

  function shutdown() {
    unsubscribe();
    clearReconnectTimer();
    stopDemoSimulator();
    Dedup.clear();
    console.log('[RT] Shutdown complete');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Realtime = {
    /* State */
    state: RTState,

    /* Core */
    init,
    shutdown,
    subscribe,
    unsubscribe,

    /* Feed */
    Feed,

    /* Manual emit */
    emit: emitEvent,

    /* Control */
    pause,
    resume,
    toggle,
    isPaused,

    /* Demo Simulator (manual) */
    startDemoSimulator,
    stopDemoSimulator,

    /* Stats */
    getStats,
    resetStats,

    /* Events */
    on,

    /* Internals (للاختبار) */
    _dedup: Dedup,
    _notifier: Notifier,
    _handleEvent: handleRealtimeEvent,
    _generateDemoEvent: generateDemoEvent,
    _buildEvent: buildEvent,
    _shouldRerender: shouldRerender,
  };

  /* ─── Convenience shortcuts ─────────────────────────────────── */
  GMS.RealtimeFeed = Feed;
  GMS.RealtimeEvents = EVENT_META;

  /* ═════════════════════════════════════════════════════════════════════
     §15 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c📡 Realtime Engine loaded · WebSocket + Live Feed',
    'color:#6b3fa0;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#f0e9fa;border-radius:4px;'
  );

  console.log(
    `%c🔌 7 tables · Dedup · Auto-reconnect · Live feed (100 events)`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    `%c🛡️  Form-aware: no rerender/notifications while typing in fields`,
    'color:#0f7a43;font-weight:700;font-size:11px;'
  );

  console.log(
    `%c💤 Demo simulator: opt-in only (localStorage: gms.demo.simulator)`,
    'color:#a55a00;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/11-realtime.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
