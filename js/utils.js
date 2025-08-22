function getCookie(k) {
	const m = document.cookie.match(new RegExp('(?:^|; )' + encodeURIComponent(k) + '=([^;]*)'));
	return m ? decodeURIComponent(m[1]) : '';
}

function setCookie(k, v, days = 30) {
	const maxAge = days * 24 * 60 * 60;
	document.cookie = `${encodeURIComponent(k)}=${encodeURIComponent(v)}; path=/; max-age=${maxAge}`;
}