var initiate = require('./proxy');

/**
 * Creates a new proxy server that forwards some requests to
 * the dpd server.
 *
 * options should be an object with the following properties:
 *
 * - port (port for the proxy server)
 * - resourcesDirectory (Directory where the resources folder will be at)
 */
var createProxyServerForDpd = function(options) {
	options.proxy.port = (typeof options.proxy.port === 'undefined') ? (3434) : (options.proxy.port);
	options.deployd.port = (typeof options.deployd.port === 'undefined') ? (3123) : (options.deployd.port);

	if (typeof options.proxy.resourcesDirectory === 'undefined') {
		throw new Error('Please, provide the directory of the resources folder');
	}

	initiate(options);
}

exports.createProxyServerForDpd = createProxyServerForDpd;