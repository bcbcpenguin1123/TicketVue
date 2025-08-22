const App = {
	// * ================================
	// *        1) 组件状态（data）
	// * ================================
	data() {
		return {
			/* —— 会议场次 —— */
			sessions: {
				JN: {
					key: 'JN',
					city: '济南',
					date: '2025年9月16日'
				},
				SH: {
					key: 'SH',
					city: '上海',
					date: '2025年9月22日'
				},
			},
			selectedSessionKey: null, // 'JN' | 'SH'
			showSessionPicker: false, // 选择场次弹窗显示与否

			/* —— 页面切换（简易路由）—— */
			pagesOrder: [
				'home', 'invite', 'signup', 'signupJN', 'signupSH',
				'ProfileEditSH', 'ProfileEditJN', 'status', 'agenda',
				'login', 'AccessPre1', 'AccessPre2', 'Access', 'hotel', 'admission'
			],
			currentPage: 'home',
			lastPage: 'home',
			transitionName: 'slide-left', // slide-left | slide-right

			/* —— 登录 / 注册 —— */
			signupType: 'phone', // 注册页：phone | email
			form: { // 注册页验证码表单
				mobile: '',
				email: '',
				session: '',
				code: ''
			},

			loginType: 'phone', // 登录页：phone | email
			loginForm: { // 登录页验证码表单
				mobile: '',
				email: '',
				code: ''
			},

			/* —— 验证码倒计时 —— */
			codeCountdown: 0,
			codeTimer: null,

			/* —— 出席人员 —— */
			attendees: [], // 列表
			editing: null, // 当前编辑对象

			/* —— 分场次的“简短一步”表单（如需保留）—— */
			formSH: {
				name: '',
				mobile: '',
				company: '',
				title: '',
				needHotel: 'no',
				hotelPlan: '',
				checkin: '',
				checkout: '',
				carPlate: ''
			},
			formJN: {
				name: '',
				mobile: '',
				company: '',
				title: '',
				needHotel: 'no',
				hotelPlan: '',
				checkin: '',
				checkout: '',
				carPlate: ''
			},

			/* —— 其他展示数据（示例）—— */
			statusInfo: {
				time: '2025年8月20日 下午14:30',
				place: '上海市 兰香湖南路 1800号'
			},
			qrUrl: '' // 后端返回的二维码图片地址
		};
	},

	// * ================================
	// *       2) 计算属性（computed）
	// * ================================
	computed: {
		selectedSession() {
			return this.sessions[this.selectedSessionKey] || null;
		}
	},

	/* ================================
	 * 3) 生命周期
	 * ================================ */
	mounted() {
		// 初始化：根据 hash 定位
		this.handleHashChange();
		window.addEventListener('hashchange', this.handleHashChange);

		// 首次进入读取缓存；没有就弹出选择
		const cache = localStorage.getItem('exh_session_key');
		if (cache && this.sessions[cache]) {
			this.selectedSessionKey = cache;
			// 可选：进入场次相关页时预加载参会人
			this.loadAttendeesBySession();
		} else {
			this.showSessionPicker = true;
		}
	},
	beforeUnmount() {
		window.removeEventListener('hashchange', this.handleHashChange);
		this.clearCountdown();
	},

	/* ================================
	 * 4) 方法（methods）
	 *   4.1 工具：Cookie / Storage / Hash
	 * ================================ */
	methods: {
		/* ---------- Cookie 工具 ---------- */
		setCookie(name, value, days = 7) {
			const maxAge = days * 24 * 60 * 60;
			document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}`;
		},
		getCookie(name) {
			const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
			return m ? decodeURIComponent(m[1]) : null;
		},

		/* ---------- 场次工具 ---------- */
		getSessionKey() {
			const k = localStorage.getItem('exh_session_key');
			if (!k) alert('请先选择会议场次');
			return k; // 可能为 null
		},
		getAttendeesStorageKey(sessionKey) {
			const k = sessionKey || this.getSessionKey();
			if (k === 'SH') return 'attendees_SH';
			if (k === 'JN') return 'attendees_JN';
			return 'attendees'; // 兜底兼容老键
		},
		loadAttendeesBySession(sessionKey) {
			const key = this.getAttendeesStorageKey(sessionKey);
			let list = [];
			try {
				list = JSON.parse(localStorage.getItem(key) || '[]');
				if (!Array.isArray(list)) list = [];
			} catch (e) {
				console.error('解析参会人列表失败:', e);
				list = [];
			}
			this.attendees = list;
		},

		saveAttendeesBySession(sessionKey) {
			const key = this.getAttendeesStorageKey(sessionKey);
			localStorage.setItem(key, JSON.stringify(this.attendees || []));
		},

		/* ---------- Hash 路由 / 转场 ---------- */
		pageIndex(p) {
			return this.pagesOrder.indexOf(p);
		},
		setTransitionByDirection(from, to) {
			const fi = this.pageIndex(from),
				ti = this.pageIndex(to);
			this.transitionName = ti > fi ? 'slide-left' : 'slide-right';
		},
		go(page) {
			if (!this.pagesOrder.includes(page)) return;
			this.setTransitionByDirection(this.currentPage, page);
			setTimeout(() => {
				this.lastPage = this.currentPage;
				this.currentPage = page;

				// 进入对应报名页时自动加载该场次参会人
				if (page === 'signupSH' || page === 'signupJN') {
					this.loadAttendeesBySession(page === 'signupSH' ? 'SH' : 'JN');
				}

				// 同步 hash
				if (location.hash !== '#' + page) history.pushState(null, '', '#' + page);

				// 回到顶部
				window.scrollTo({
					top: 0,
					behavior: 'instant'
				});
			}, 100);
		},
		handleHashChange() {
			const target = (location.hash || '#home').slice(1);
			const page = this.pagesOrder.includes(target) ? target : 'home';
			if (page === this.currentPage) return;
			this.setTransitionByDirection(this.currentPage, page);
			this.lastPage = this.currentPage;
			this.currentPage = page;

			// 进入对应报名页时自动加载该场次参会人
			if (page === 'signupSH' || page === 'signupJN') {
				this.loadAttendeesBySession(page === 'signupSH' ? 'SH' : 'JN');
			}

			window.scrollTo({
				top: 0,
				behavior: 'instant'
			});
		},
		goBack() {
			setTimeout(() => {
				if (window.history.length > 1) window.history.back();
				else this.go('home');
			}, 100);
		},

		/* ================================
		 * 4.2 入口：参会登记 / 入场码
		 * ================================ */
		// 点击“参会登记”
		enterSignup() {
			// login_status：0 未注册未登记；1 已注册未登记；2 已注册已登记
			const login = this.getCookie('login_status') || '0';
			if (login === '0') {
				this.go('signup'); // 去注册/登录页
				return;
			}

			// 已注册（1 或 2）→ 检查场次并进入对应报名页
			const key = localStorage.getItem('exh_session_key'); // 'JN' | 'SH'
			if (!key) {
				if (typeof this.openSessionPicker === 'function') this.openSessionPicker();
				else alert('请先选择会议场次');
				return;
			}
			if (key === 'JN') this.go('signupJN');
			else if (key === 'SH') this.go('signupSH');
			else {
				alert('无法识别会议场次，请重新选择');
				if (typeof this.openSessionPicker === 'function') this.openSessionPicker();
				else this.go('signup');
			}
		},

		// 点击“入场码”
		async enterAccess() {
			const login = this.getCookie('login_status'); // 0/1/2 或 null
			if (login === null || login === '' || login === 'undefined') {
				this.go('login');
				return;
			}
			if (login === '0') {
				this.go('signup');
				return;
			} // 未注册
			if (login === '1') {
				this.go('AccessPre1');
				return;
			} // 已注册未登记

			// 走到这里视为“已注册已登记”
			// 默认置为未审核，避免请求失败没有状态
			this.setCookie('access_status', '0');

			try {
				const userId = this.getCookie('user_mobile') || this.getCookie('user_email') || '';
				const resp = await fetch('/api/access/status', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						userId
					})
				});
				if (resp.ok) {
					const data = await resp.json();
					const st = (data && (data.access_status === 1 ? '1' : '0')) || '0'; // 0未审核 1通过
					this.setCookie('access_status', st);
				} else {
					console.warn('access status http error', resp.status);
				}
			} catch (e) {
				console.warn('access status request failed', e);
			}

			const access = this.getCookie('access_status'); // 0/1
			if (access === '1' || login === '3') this.go('Access');
			else this.go('AccessPre2');
		},

		// 从 AccessPre1 进入登记（复用会场分流）
		goSessionPage() {
			const sessionKey = localStorage.getItem('exh_session_key');
			if (sessionKey && this.sessions && this.sessions[sessionKey]) {
				if (sessionKey === 'JN') this.go('signupJN');
				else if (sessionKey === 'SH') this.go('signupSH');
				else alert('未知的会议场次');
			} else {
				alert('请先选择会议场次');
				this.openSessionPicker?.();
			}
		},
		goSignupFromAccess() {
			this.goSessionPage();
		},

		/* ================================
		 * 4.3 登录/注册 & 验证码
		 * ================================ */
		clearCountdown() {
			if (this.codeTimer) {
				clearInterval(this.codeTimer);
				this.codeTimer = null;
			}
			this.codeCountdown = 0;
		},
		// 注册页获取验证码
		getCode() {
			if (this.codeCountdown > 0) return;
			if (this.signupType === 'phone') {
				if (!this.form.mobile) return alert('请输入手机号');
				if (!/^1[3-9]\d{9}$/.test(this.form.mobile)) return alert('手机号格式不正确');
				alert('调用后端接口发送短信验证码');
			} else {
				if (!this.form.email) return alert('请输入邮箱');
				if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email)) return alert('邮箱格式不正确');
				alert('调用后端接口发送邮箱验证码');
			}
			this.codeCountdown = 60;
			this.codeTimer = setInterval(() => {
				if (this.codeCountdown > 0) this.codeCountdown--;
				else this.clearCountdown();
			}, 1000);
		},
		// 注册提交（Step.2）
		submitSignup() {
			if (this.signupType === 'phone') {
				if (!this.form.mobile) return alert('请输入手机号');
				if (!/^1[3-9]\d{9}$/.test(this.form.mobile)) return alert('手机号格式不正确');
			} else {
				if (!this.form.email) return alert('请输入邮箱');
				if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email)) return alert('邮箱格式不正确');
			}
			if (!this.form.code) return alert('请输入验证码');

			const sessionKey = localStorage.getItem('exh_session_key');
			if (!(sessionKey && this.sessions[sessionKey])) {
				alert('请先选择会议场次');
				this.openSessionPicker?.();
				return;
			}
			const sessionInfo = this.sessions[sessionKey];
			this.form.session = sessionInfo.city;

			alert(`调用后端注册接口，参数：${JSON.stringify(this.form)}`);

			// 记录用户标识 & 登录态
			if (this.signupType === 'phone') this.setCookie('user_mobile', this.form.mobile);
			else this.setCookie('user_email', this.form.email);
			this.setCookie('login_status', '1'); // 已注册未登记

			// 分场次进入报名
			if (sessionKey === 'JN') this.go('signupJN');
			else if (sessionKey === 'SH') this.go('signupSH');
			else alert('没匹配到');
		},

		// 登录页获取验证码
		getLoginCode() {
			if (this.codeCountdown > 0) return;
			if (this.loginType === 'phone') {
				if (!this.loginForm.mobile) return alert('请输入手机号');
				if (!/^1[3-9]\d{9}$/.test(this.loginForm.mobile)) return alert('手机号格式不正确');
				alert('调用后端接口发送短信验证码');
			} else {
				if (!this.loginForm.email) return alert('请输入邮箱');
				if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.loginForm.email)) return alert('邮箱格式不正确');
				alert('调用后端接口发送邮箱验证码');
			}
			this.codeCountdown = 60;
			this.codeTimer = setInterval(() => {
				if (this.codeCountdown > 0) this.codeCountdown--;
				else this.clearCountdown();
			}, 1000);
		},
		// 登录提交：验证 & 取 abc 分流
		async submitLogin() {
			if (this.loginType === 'phone') {
				if (!this.loginForm.mobile) return alert('请输入手机号');
				if (!/^1[3-9]\d{9}$/.test(this.loginForm.mobile)) return alert('手机号格式不正确');
			} else {
				if (!this.loginForm.email) return alert('请输入邮箱');
				if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.loginForm.email)) return alert('邮箱格式不正确');
			}
			if (!this.loginForm.code) return alert('请输入验证码');

			alert('调用后端登录接口，参数：' + JSON.stringify(this.loginForm));
			// TODO: 替换为真实接口返回
			// 后端期望返回 { abc: 0 | 1 | 2 }：
			// 0 未登记；1 已登记未审核；2 已登记已审核
			const mock = {
				abc: 2
			};
			const abc = mock.abc;

			// 保存用户标识
			if (this.loginType === 'phone') this.setCookie('user_mobile', this.loginForm.mobile);
			else this.setCookie('user_email', this.loginForm.email);

			// 分流
			if (abc === 1) {
				this.setCookie('login_status', '2'); // 已注册已登记
				this.go('AccessPre2');
				return;
			}
			if (abc === 2) {
				this.setCookie('login_status', '3'); // 已注册已登记且审核通过（兼容老含义）
				this.go('Access');
				return;
			}

			// abc === 0 未登记 → 进入报名
			const sessionKey = localStorage.getItem('exh_session_key');
			if (!(sessionKey && this.sessions[sessionKey])) {
				alert('请先选择会议场次');
				this.openSessionPicker?.();
				return;
			}
			this.setCookie('login_status', '1'); // 已登录但未登记
			if (sessionKey === 'JN') this.go('signupJN');
			else if (sessionKey === 'SH') this.go('signupSH');
			else alert('未识别的会议场次');
		},

		/* ================================
		 * 4.4 报名第二步（校验 & 提交）
		 * ================================ */
		validateProfileBySession(profile) {
			const key = this.getSessionKey();
			if (key === 'SH') {
				if (!profile.name) return '请填写姓名';
				if (!profile.company) return '请填写公司名称';
				if (!profile.title) return '请填写职位';
				if (profile.mobile && !/^1[3-9]\d{9}$/.test(profile.mobile)) return '手机号格式不正确';
				if (profile.needHotel === 'yes') {
					if (!profile.hotelPlan) return '请选择住宿安排';
					if (!profile.stayNights || !profile.stayNights.length) return '请选择住宿日期';
				}
				return '';
			} else if (key === 'JN') {
				if (!profile.name) return '请填写姓名';
				return '';
			}
			return '';
		},

		submitSignup2() {
			// 1) 场次
			const sessionKey = this.getSessionKey();
			if (!sessionKey) return;

			const sessionInfo = (this.sessions && this.sessions[sessionKey]) || {
				key: sessionKey
			};

			// 2) 必须至少有一位出席人
			if (!Array.isArray(this.attendees) || this.attendees.length === 0) {
				alert('请先新增至少 1 位出席人员');
				this.goEditBySession();
				return;
			}

			// 3) 逐个校验出席人
			for (let i = 0; i < this.attendees.length; i++) {
				const p = this.attendees[i];
				const msg = this.validateProfileBySession(p);
				if (msg) {
					alert(`第 ${i + 1} 位出席人有问题：${msg}`);
					this.openEditProfile(p.id);
					return;
				}
				if (p.needHotel !== 'yes') {
					p.hotelPlan = '';
					p.stayNights = [];
				}
			}

			// 4) 组织 payload
			const payload = {
				sessionKey,
				session: sessionInfo,
				attendees: this.attendees.map(a => ({
					...a
				})),
				meta: {
					submittedAt: new Date().toISOString()
				}
			};

			// 5) 提交（占位）
			alert('提交报名（第二步）到后端：\n' + JSON.stringify(payload, null, 2));

			// 6) 存储状态 & 参会人（按场次）
			this.setCookie('login_status', '2'); // 已注册已登记
			this.saveAttendeesBySession(sessionKey); // localStorage 按场次存

			// 7) 跳转成功页
			this.go('status');
		},

		/* ================================
		 * 4.5 出席人 CRUD（编辑页/列表页公用）
		 * ================================ */
		goEditBySession() {
			const key = this.getSessionKey();
			if (key === 'SH') this.go('ProfileEditSH');
			else if (key === 'JN') this.go('ProfileEditJN');
		},
		goListBySession() {
			const key = this.getSessionKey();
			this.loadAttendeesBySession(key);
			if (key === 'SH') this.go('signupSH');
			else if (key === 'JN') this.go('signupJN');
			else this.go('signupSH');
		},

		openCreateProfile() {
			this.editing = {
				id: null,
				name: '',
				gender: '男',
				mobile: '',
				company: '',
				title: '',
				needHotel: 'no',
				hotelPlan: '',
				stayNights: [],
				carPlate: ''
			};
			this.goEditBySession();
		},
		openEditProfile(id) {
			const src = this.attendees.find(x => x.id === id);
			if (!src) return;
			this.editing = JSON.parse(JSON.stringify(src));
			this.goEditBySession();
		},
		saveProfile() {
			const a = this.editing;
			const msg = this.validateProfileBySession(a);
			if (msg) return alert(msg);

			if (a.needHotel !== 'yes') {
				a.hotelPlan = '';
				a.stayNights = [];
			}

			if (a.id == null) {
				a.id = Date.now();
				this.attendees.push(JSON.parse(JSON.stringify(a)));
			} else {
				const idx = this.attendees.findIndex(x => x.id === a.id);
				if (idx > -1) this.attendees.splice(idx, 1, JSON.parse(JSON.stringify(a)));
			}

			const key = this.getSessionKey();
			this.saveAttendeesBySession(key);

			alert('保存出席人员到后端（占位）\n' + JSON.stringify(a, null, 2));
			this.goListBySession();
		},
		removeProfile(id) {
			if (!confirm('确认删除该出席人员吗？')) return;
			this.attendees = this.attendees.filter(x => x.id !== id);

			const key = this.getSessionKey();
			this.saveAttendeesBySession(key);

			alert('已删除（同步后端）');
			if (this.currentPage === 'ProfileEditSH' || this.currentPage === 'ProfileEditJN') {
				this.goListBySession();
			}
		},

		/* ================================
		 * 4.6 场次选择弹窗
		 * ================================ */
		openSessionPicker() {
			setTimeout(() => {
				this.showSessionPicker = true;
			}, 100);
		},
		closeSessionPicker() {
			setTimeout(() => {
				this.showSessionPicker = false;
			}, 100);
		},
		setSession(key) {
			setTimeout(() => {
				if (!this.sessions[key]) return;
				this.selectedSessionKey = key;
				localStorage.setItem('exh_session_key', key);
				this.showSessionPicker = false;
				// 可选：切回首页并刷新展示
				if (this.currentPage !== 'home') this.go('home');
			}, 100);
		},

		/* ================================
		 * 4.7 展示工具
		 * ================================ */
		humanizeNights(list) {
			return list.join('、');
		},
		hotelPlanLabel(v) {
			return ({
				single: '单人间',
				twin: '大床房/双人间',
				self: '自理（仅登记）'
			})[v] || '';
		},

	} // end methods
};
Vue.createApp(App).mount('#app');