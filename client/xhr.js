/*
 * Copyright 2012-2014 the original author or authors
 * @license MIT, see LICENSE.txt for details
 *
 * @author Scott Andrews
 */

(function (define, global) {
    'use strict';

    define(function (require) {

        var when, UrlBuilder, normalizeHeaderName, responsePromise, headerSplitRE;

        when = require('when');
        UrlBuilder = require('../UrlBuilder');
        normalizeHeaderName = require('../util/normalizeHeaderName');
        responsePromise = require('../util/responsePromise');

        // according to the spec, the line break is '\r\n', but doesn't hold true in practice
        headerSplitRE = /[\r|\n]+/;

        function parseHeaders(raw) {
            // Note: Set-Cookie will be removed by the browser
            var headers = {};

            if (!raw) { return headers; }

            raw.trim().split(headerSplitRE).forEach(function (header) {
                var boundary, name, value;
                boundary = header.indexOf(':');
                name = normalizeHeaderName(header.substring(0, boundary).trim());
                value = header.substring(boundary + 1).trim();
                if (headers[name]) {
                    if (Array.isArray(headers[name])) {
                        // add to an existing array
                        headers[name].push(value);
                    }
                    else {
                        // convert single value to array
                        headers[name] = [headers[name], value];
                    }
                }
                else {
                    // new, single value
                    headers[name] = value;
                }
            });

            return headers;
        }

        function xhr(request) {
            return new responsePromise.ResponsePromise(function (resolve, reject) {

                var client, method, url, headers, entity, headerName, response, XMLHttpRequest;

                request = typeof request === 'string' ? { path: request } : request || {};
                response = { request: request };

                if (request.canceled) {
                    response.error = 'precanceled';
                    reject(response);
                    return;
                }

                XMLHttpRequest = request.engine || global.XMLHttpRequest;
                if (!XMLHttpRequest) {
                    reject({ request: request, error: 'xhr-not-available' });
                    return;
                }

                entity = request.entity;
                request.method = request.method || (entity ? 'POST' : 'GET');
                method = request.method;
                url = new UrlBuilder(request.path || '', request.params).build();

                try {
                    client = response.raw = new XMLHttpRequest();
                    client.open(method, url, true);
                    client.timeout = request.timeout || 0;

                    client.ontimeout = function () {
                        response.error = 'timeout';
                        response.status = {text: response.error};
                        return reject(response);
                    };


                    if (request.mixin) {
                        Object.keys(request.mixin).forEach(function (prop) {
                            // make sure the property already exists as
                            // IE 6 will blow up if we add a new prop
                            if (request.mixin.hasOwnProperty(prop) && prop in client) {
                                client[prop] = request.mixin[prop];
                            }
                        });
                    }

                    headers = request.headers;
                    for (headerName in headers) {
                        /*jshint forin:false */
                        client.setRequestHeader(headerName, headers[headerName]);
                    }

                    request.canceled = false;
                    request.cancel = function cancel() {
                        request.canceled = true;
                        client.abort();
                        reject(response);
                    };

                    client.onreadystatechange = function (/* e */) {
                        if (request.canceled) { return; }
                        if (client.readyState === (XMLHttpRequest.DONE || 4)) {
                            try {
                                response.status = {
                                    code: client.status,
                                    text: client.statusText
                                };
                                response.headers = parseHeaders(client.getAllResponseHeaders());
                                response.entity = client.responseText;

                                if (response.status.code > 0) {
                                    // check status code as readystatechange fires before error event
                                    resolve(response);
                                }
                            } catch (e) {
                                //ie8 fires "Unspecified Error" in case of a timeout
                                response.error = e;
                                reject(response);
                            }
                        }
                    };

                    try {
                        client.onerror = function (/* e */) {
                            response.error = 'loaderror';
                            reject(response);
                        };
                    }
                    catch (e) {
                        // IE 6 will not support error handling
                    }

                    client.send(entity);
                }
                catch (e) {
                    response.error = 'loaderror';
                    reject(response);
                }

            });
        }

        xhr.chain = function (interceptor, config) {
            return interceptor(xhr, config);
        };

        return xhr;

    });

}(
        typeof define === 'function' && define.amd ? define : function (factory) { module.exports = factory(require); },
        this
        // Boilerplate for AMD and Node
    ));
