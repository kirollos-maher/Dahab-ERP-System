/**
 * Gold ERP Pro - Comprehensive Accounting & Treasury View
 * الملف: 26-views-accounting.js
 * النظام المحاسبي المزدوج (النقدية والذهب الكسر/الصافي)
 */

const AccountingView = {
  async render() {
    let ledger = [];
    let stats = { cash: 0, gold24: 0, gold21: 0, gold18: 0 };

    try {
      if (window.CacheDB && typeof window.CacheDB.getAll === 'function') {
        ledger = await CacheDB.getAll('ledger') || [];
        
        // حساب إجمالي الإحصائيات
        ledger.forEach(item => {
          if (item.cashAmount) stats.cash += parseFloat(item.cashAmount || 0);
          if (item.karat == 24) stats.gold24 += parseFloat(item.goldWeight || 0);
          if (item.karat == 21) stats.gold21 += parseFloat(item.goldWeight || 0);
          if (item.karat == 18) stats.gold18 += parseFloat(item.goldWeight || 0);
        });
      }
    } catch (e) {
      console.warn("تنبيه أثناء جلب بيانات الدفتر المحاسبي:", e);
    }

    return `
      <div class="accounting-wrapper">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 class="card-title">⚖️ الحسابات المالية ودفتر الذهب</h2>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-secondary" id="btn-open-expense-modal">💸 تسجيل مصروف</button>
            <button class="btn btn-primary" id="btn-open-settlement-modal">🔄 تسوية ذهب / مورد</button>
          </div>
        </div>

        <!-- كروت الإحصائيات (KPIs) -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
          <div class="card" style="border-right: 4px solid #2ecc71;">
            <span style="color: var(--text-muted); font-size: 0.85rem;">الرصيد النقدي الحالي</span>
            <div style="font-size: 1.4rem; font-weight: bold; color: #2ecc71; margin-top: 5px;">
              ${stats.cash.toLocaleString('ar-EG')} ج.م
            </div>
          </div>
          <div class="card" style="border-right: 4px solid var(--gold-primary);">
            <span style="color: var(--text-muted); font-size: 0.85rem;">رصيد ذهب عيار 21</span>
            <div style="font-size: 1.4rem; font-weight: bold; color: var(--gold-primary); margin-top: 5px;">
              ${stats.gold21.toFixed(2)} جم
            </div>
          </div>
          <div class="card" style="border-right: 4px solid #f1c40f;">
            <span style="color: var(--text-muted); font-size: 0.85rem;">رصيد ذهب عيار 24</span>
            <div style="font-size: 1.4rem; font-weight: bold; color: #f1c40f; margin-top: 5px;">
              ${stats.gold24.toFixed(2)} جم
            </div>
          </div>
          <div class="card" style="border-right: 4px solid #e67e22;">
            <span style="color: var(--text-muted); font-size: 0.85rem;">رصيد ذهب عيار 18</span>
            <div style="font-size: 1.4rem; font-weight: bold; color: #e67e22; margin-top: 5px;">
              ${stats.gold18.toFixed(2)} جم
            </div>
          </div>
        </div>

        <!-- جدول دفتر اليومية العام -->
        <div class="card" style="padding: 0; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse; text-align: right;">
            <thead>
              <tr style="background: rgba(255,255,255,0.05); border-bottom: 1px solid var(--border-color);">
                <th style="padding: 12px 15px;">رقم الحركة</th>
                <th style="padding: 12px 15px;">التاريخ</th>
                <th style="padding: 12px 15px;">نوع المعاملة</th>
                <th style="padding: 12px 15px;">المبلغ النقدي</th>
                <th style="padding: 12px 15px;">وزن الذهب</th>
                <th style="padding: 12px 15px;">العيار</th>
                <th style="padding: 12px 15px;">البيان / ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              ${ledger.length > 0 ? ledger.map(entry => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                  <td style="padding: 12px 15px; font-family: monospace; color: var(--gold-primary);">${entry.id || '---'}</td>
                  <td style="padding: 12px 15px;">${entry.date || '---'}</td>
                  <td style="padding: 12px 15px;">${entry.type || 'عام'}</td>
                  <td style="padding: 12px 15px; color: ${entry.cashAmount >= 0 ? '#2ecc71' : '#e74c3c'};">${entry.cashAmount || 0} ج.م</td>
                  <td style="padding: 12px 15px;">${entry.goldWeight || 0} جم</td>
                  <td style="padding: 12px 15px;">${entry.karat ? 'عيار ' + entry.karat : '---'}</td>
                  <td style="padding: 12px 15px;">${entry.description || '---'}</td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">لا توجد قيود محاسبية مسجلة حالياً</td>
                </tr>
              `}
            </tbody>
          </table>
        </div>

        <!-- Modal تسجيل مصروف -->
        <div id="expense-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 9999; justify-content: center; align-items: center;">
          <div class="card" style="width: 100%; max-width: 450px; background: var(--bg-dark-100); border: 1px solid var(--gold-primary); padding: 25px;">
            <h3 style="color: var(--gold-primary); margin-bottom: 20px;">💸 تسجيل مصروف جديد</h3>
            <form id="form-add-expense">
              <div style="margin-bottom: 12px;">
                <label style="display: block; margin-bottom: 5px; color: var(--text-muted);">بند المصروف:</label>
                <input type="text" id="expense-title" class="btn" style="width: 100%; background: var(--bg-dark-300); color: #fff; text-align: right;" placeholder="مثال: إيجار / كهرباء" required />
              </div>
              <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 5px; color: var(--text-muted);">المبلغ النقدي (ج.م):</label>
                <input type="number" id="expense-amount" class="btn" style="width: 100%; background: var(--bg-dark-300); color: #fff; text-align: right;" placeholder="0.00" required />
              </div>
              <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button type="button" class="btn btn-secondary" onclick="document.getElementById('expense-modal').style.display='none'">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ المصروف</button>
              </div>
            </form>
          </div>
        </div>

      </div>
    `;
  },

  async afterRender() {
    this.initEvents();
  },

  async init() {
    this.initEvents();
  },

  initEvents() {
    const expenseBtn = document.getElementById('btn-open-expense-modal');
    const expenseModal = document.getElementById('expense-modal');
    const expenseForm = document.getElementById('form-add-expense');

    if (expenseBtn && expenseModal) {
      expenseBtn.onclick = () => { expenseModal.style.display = 'flex'; };
    }

    if (expenseForm) {
      expenseForm.onsubmit = async (e) => {
        e.preventDefault();
        const entry = {
          id: 'TX_' + Date.now(),
          date: new Date().toLocaleDateString('ar-EG'),
          type: 'مصروفات',
          cashAmount: -Math.abs(parseFloat(document.getElementById('expense-amount').value)),
          goldWeight: 0,
          karat: null,
          description: document.getElementById('expense-title').value
        };

        try {
          if (window.CacheDB && typeof window.CacheDB.save === 'function') {
            await CacheDB.save('ledger', entry);
          }
          alert('تم تسجيل المصروف بنجاح!');
          expenseModal.style.display = 'none';
          if (window.App && typeof window.App.navigateTo === 'function') {
            window.App.navigateTo('accounting');
          }
        } catch (err) {
          console.error("خطأ أثناء تسجيل المصروف:", err);
        }
      };
    }
  }
};

window.AccountingView = AccountingView;