/** =========== 校验 =========== */
function validatePhone(phone) {
	if (!phone) return '请输入手机号';
	if (!/^1[3-9]\d{9}$/.test(phone)) return '手机号格式不正确';
	return '';
}

function validateEmail(email) {
	if (!email) return '请输入邮箱';
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '邮箱格式不正确';
	return '';
}

/** =========== 倒计时（注入 vm 显示状态） =========== */
function startCountdown(vm, sec = 59) {
	vm.codeCountdown = sec;
	vm.codeTimer && clearInterval(vm.codeTimer);
	vm.codeTimer = setInterval(() => {
		if (vm.codeCountdown > 0) vm.codeCountdown--;
		else clearCountdown(vm);
	}, 1000);
}

function clearCountdown(vm) {
	clearInterval(vm.codeTimer);
	vm.codeTimer = null;
	vm.codeCountdown = 0;
}

/** =========== API 封装 =========== */
async function sendPhoneCode(phone) {
	const res = await fetch(apiUrl("/cs/send_code"), {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			phoneNo: phone
		})
	});
	if (!res.ok) throw new Error("HTTP " + res.status);
	const json = await res.json();
	if (json.code !== 0 || json.data !== true) throw new Error(json.message || "验证码发送失败");
	return true;
}

async function verifyCodeAndGetToken({ signupType, mobile, email, code }) {
	const payload = signupType === "phone" 
		? { phoneNo: mobile, captcha: code } 
		: { email, captcha: code };

	const resp = await fetch(apiUrl("/cs/verify_code"), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});

	if (!resp.ok) {
		let err = {};
		try {
			err = await resp.json();
		} catch {}
		throw new Error(err.message || "验证码验证失败");
	}

	// 解析返回的内容
	const raw = await resp.text();
	try {
		const json = JSON.parse(raw);
		if (json.code !== 0 || !json.data) {
			throw new Error(json.message || "验证码验证失败");
		}
		// 成功返回的 token
		return json.data;
	} catch {
		// 如果返回的是一个有效的 token（非 JSON），直接返回它
		if (raw && raw.length > 10 && !raw.includes("Exception")) {
			return raw; // 返回纯 token
		}
		throw new Error("验证码验证失败");
	}
}

async function fetchUserInfoByToken(token) {
	const headers = new Headers({
		"X-Auth-Token": token
	});
	const uiRes = await fetch(apiUrl("/cs/user/info"), {
		method: "GET",
		headers
	});
	if (!uiRes.ok) {
		const t = await uiRes.text().catch(() => "");
		throw new Error("获取用户信息失败");
	}
	const uiJson = await uiRes.json().catch(() => ({}));
	if (uiJson.code !== 0 || !uiJson.data) throw new Error(uiJson.message || "用户信息返回异常");
	const {
		customerId,
		phoneNo,
		status
	} = uiJson.data;
	return {
		customerId,
		phoneNo,
		status
	};
}

/** =========== 登录会话缓存 =========== */
function cacheSessionAfterLogin({
	signupType,
	mobile,
	email,
	token
}) {
	if (signupType === "phone") setCookie("user_mobile", mobile);
	else setCookie("user_email", email);
	setCookie("auth_token", token);
	setCookie("login_status", "1");
}

function cacheUserInfoToCookies({
	customerId,
	phoneNo,
	status
}) {
	if (customerId) setCookie("customerId", customerId);
	if (typeof status !== "undefined") setCookie("userStatus", String(status));
	if (!getCookie("user_mobile") && phoneNo) setCookie("user_mobile", phoneNo);
}

/** =========== 场次标志初始化（未设置则补0） =========== */
function ensureSessionFlags(sessionKey) {
	if (sessionKey === "JN") {
		if (!getCookie("checkinJN")) setCookie("checkinJN", "0");
		if (!getCookie("access_statusJN")) setCookie("access_statusJN", "0");
	} else if (sessionKey === "SH") {
		if (!getCookie("checkinSH")) setCookie("checkinSH", "0");
		if (!getCookie("access_statusSH")) setCookie("access_statusSH", "0");
	}
}

/** =========== 注册/登录主流程（给 Vue 用） =========== */
async function doSignupLoginFlow(vm) {
	// Step.1 表单校验
	if (vm.signupType === "phone") {
		const err = validatePhone(vm.form.mobile?.trim());
		if (err) return alert(err);
	} else {
		const err = validateEmail(vm.form.email?.trim());
		if (err) return alert(err);
	}
	if (!vm.form.code?.trim()) return alert("请输入验证码");

	// Step.2 场次检查
	const sessionKey = localStorage.getItem("exh_session_key");
	if (!sessionKey || !vm.sessions[sessionKey]) {
		alert("请先选择会议场次");
		vm.openSessionPicker?.();
		console.warn("[submitSignup] 未选择场次");
		return;
	}
	vm.form.session = vm.sessions[sessionKey].city; // 便于后续使用
	console.log("[submitSignup] sessionKey:", sessionKey, "city:", vm.form.session);

	// Step.3 调 verify 拿 token
	let token = null;
	try {
		token = await verifyCodeAndGetToken({
			signupType: vm.signupType,
			mobile: vm.form.mobile,
			email: vm.form.email,
			code: vm.form.code
		});
	} catch (e) {
		console.error("[doSignupLoginFlow] error:", e);
		alert(e.message || "注册失败，请稍后再试");
		return;
	}

	if (!token) return; // 如果没有 token，不继续执行

	// Step.4 拉用户信息并落 Cookie
	cacheSessionAfterLogin({
		signupType: vm.signupType,
		mobile: vm.form.mobile,
		email: vm.form.email,
		token
	});
	console.log("[submitSignup] token cached");

	const ui = await fetchUserInfoByToken(token);
	cacheUserInfoToCookies(ui);
	console.log("[submitSignup] user info cached ->", ui);

	// Step.5 初始化当前场次的登记/审核状态
	ensureSessionFlags(sessionKey);

	// Step.6 同步参会数据到本地（沿用你现有函数）
	// 拉参会信息
	const raw = await fetchAttendanceRaw(token);
	console.log(raw);

	// 解析与落地
	const parsed = parseAttendanceData(raw);
	writeAttendanceToLocalStorage(parsed);
	writePerSessionAttendeesFromWeb();

	// Step.7 跳转到对应登记页
	if (sessionKey === "JN") vm.go?.("signupJN");
	else if (sessionKey === "SH") vm.go?.("signupSH");
	else alert("未识别的场次");
}





/** =========== 登录主流程（给 Vue 用） =========== */
async function doLoginFlow(vm) {
	// Step.1 表单校验
	if (vm.loginType === "phone") {
		const err = validatePhone(vm.loginForm.mobile?.trim());
		if (err) return alert(err);
	} else {
		const err = validateEmail(vm.loginForm.email?.trim());
		if (err) return alert(err);
	}
	if (!vm.loginForm.code?.trim()) return alert("请输入验证码");

	// Step.2 调 verify 拿 token
	let token = null;
	try {
		token = await verifyCodeAndGetToken({
			signupType: vm.loginType,
			mobile: vm.loginForm.mobile,
			email: vm.loginForm.email,
			code: vm.loginForm.code
		});
	} catch (e) {
		console.error("[doLoginFlow] error:", e);
		alert(e.message || "登录失败，请稍后再试");
		return;
	}

	if (!token) return; // 如果没有 token，不继续执行

	// Step.3 拉用户信息并落 Cookie
	cacheSessionAfterLogin({
		signupType: vm.loginType,
		mobile: vm.loginForm.mobile,
		email: vm.loginForm.email,
		token
	});
	console.log("[submitLogin] token cached");

	const ui = await fetchUserInfoByToken(token);
	cacheUserInfoToCookies(ui);
	console.log("[submitLogin] user info cached ->", ui);

	// Step.4 确定场次：优先后端返回，其次本地
	let sessionKey = ui.session || localStorage.getItem("exh_session_key");
	if (!sessionKey || !vm.sessions[sessionKey]) {
		alert("请先选择会议场次");
		vm.openSessionPicker?.();
		console.warn("[submitLogin] 未选择场次");
		return;
	}
	localStorage.setItem("exh_session_key", sessionKey);

	// Step.5 初始化当前场次的登记/审核状态
	ensureSessionFlags(sessionKey);

	// Step.6 同步参会数据到本地
	const raw = await fetchAttendanceRaw(token);
	console.log(raw);

	const parsed = parseAttendanceData(raw);
	writeAttendanceToLocalStorage(parsed);
	writePerSessionAttendeesFromWeb();

	// Step.7 路由分流
	await routeAfterLogin(vm, sessionKey);
}


/** =========== 路由分流（根据 checkin + qrcode 实时数据） =========== */
async function routeAfterLogin(vm, sessionKey) {
	let checkin = "0";

	if (sessionKey === "JN") {
		checkin = getCookie("checkinJN") || "0";
	} else if (sessionKey === "SH") {
		checkin = getCookie("checkinSH") || "0";
	}

	// 还没登记 → 去登记页
	if (checkin === "0") {
		vm.go?.("AccessPre1");
		return;
	}

	// 已登记 → 必须实时拉二维码信息
	let qrData = null;
	try {
		qrData = await fetchAndStoreQrCode(
			getCookie("auth_token"),
			getCookie("customerId")
		);
	} catch (err) {
		console.warn("[fetchAndStoreQrCode] 接口异常:", err.message);
		qrData = null;
	}

	console.log("[qrData]", qrData);

	// 根据接口写入的 cookies 判断 access 状态
	let access = "0";
	if (sessionKey === "JN") {
		access = getCookie("access_statusJN") || "0";
	} else if (sessionKey === "SH") {
		access = getCookie("access_statusSH") || "0";
	}

	if (access === "0") {
		vm.go?.("AccessPre2"); // 已登记待审核
		return;
	}
	if (access === "1") {
		vm.go?.("Access"); // 审核通过 → 入场码页
		return;
	}

	// 兜底
	alert("未识别的用户状态");
}