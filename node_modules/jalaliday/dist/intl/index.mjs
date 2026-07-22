//#region src/intl/format.ts
const defaultOptions = {
	locale: "fa-IR-u-ca-persian",
	defaultFormat: "YYYY/MM/DD",
	timeZone: "Asia/Tehran"
};
const tokenMap = {
	YYYY: (parts) => parts.year ?? "",
	YY: (parts) => parts.year ? parts.year.slice(-2) : "",
	MM: (parts) => parts.month ?? "",
	M: (parts) => parts.month ? String(parts.month) : "",
	DD: (parts) => parts.day ?? "",
	D: (parts) => parts.day ? String(parts.day) : "",
	HH: (parts) => parts.hour ?? "00",
	H: (parts) => parts.hour ? String(parts.hour) : "0",
	mm: (parts) => parts.minute ?? "00",
	m: (parts) => parts.minute ? String(parts.minute) : "0",
	ss: (parts) => parts.second ?? "00",
	s: (parts) => parts.second ? String(parts.second) : "0"
};
const tokenRegex = /YYYY|YY|MM|M|DD|D|HH|H|mm|m|ss|s/g;
function createFormatter(opts = defaultOptions) {
	const { locale, defaultFormat, timeZone } = {
		...defaultOptions,
		...opts
	};
	const formatter = new Intl.DateTimeFormat(locale, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		numberingSystem: "latn",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
		timeZone
	});
	/**
	* Formats a Date object using a Day.js-like format string (limited to supported tokens).
	* @param date - The Date object to format
	* @param format - The format string (e.g., 'YYYY/MM/DD HH:mm:ss')
	* @returns The formatted date string
	*/
	return function formatDate$1(date, format) {
		const parts = formatter.formatToParts(date).reduce((acc, part) => {
			if (part.type !== "literal") acc[part.type] = part.value;
			return acc;
		}, {});
		return (format || defaultFormat || "YYYY/MM/DD").replace(tokenRegex, (token) => {
			const fn = tokenMap[token];
			return fn ? fn(parts) : token;
		});
	};
}
/**
* Formats a Date object using a Day.js-like format string (limited to supported tokens).
* @param date - The Date object to format
* @param format - The format string (e.g., 'YYYY/MM/DD HH:mm:ss')
* @returns The formatted date string
*/
const formatDate = createFormatter({
	locale: "fa-IR-u-ca-persian",
	defaultFormat: "YYYY/MM/DD",
	timeZone: "Asia/Tehran"
});

//#endregion
export { createFormatter, formatDate };