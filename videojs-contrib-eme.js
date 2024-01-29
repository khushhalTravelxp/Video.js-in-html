/*! @name videojs-contrib-eme @version 3.11.1 @license Apache-2.0 */
(function(global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('global/document'), require('video.js'), require('global/window')) :
    typeof define === 'function' && define.amd ? define(['exports', 'global/document', 'video.js', 'global/window'], factory) :
      (factory((global.videojsContribEme = {}), global.document, global.videojs, global.window));
}(this, (function(exports, document, videojs, window) {
  'use strict';

  document = document && document.hasOwnProperty('default') ? document['default'] : document;
  videojs = videojs && videojs.hasOwnProperty('default') ? videojs['default'] : videojs;
  window = window && window.hasOwnProperty('default') ? window['default'] : window;

  function _extends() {
    _extends = Object.assign || function(target) {
      for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i];

        for (var key in source) {
          if (Object.prototype.hasOwnProperty.call(source, key)) {
            target[key] = source[key];
          }
        }
      }

      return target;
    };

    return _extends.apply(this, arguments);
  }

  var stringToUint16Array = function stringToUint16Array(string) {
    // 2 bytes for each char
    var buffer = new ArrayBuffer(string.length * 2);
    var array = new Uint16Array(buffer);

    for (var i = 0; i < string.length; i++) {
      array[i] = string.charCodeAt(i);
    }

    return array;
  };
  var uint8ArrayToString = function uint8ArrayToString(array) {
    return String.fromCharCode.apply(null, new Uint16Array(array.buffer));
  };
  var getHostnameFromUri = function getHostnameFromUri(uri) {
    var link = document.createElement('a');
    link.href = uri;
    return link.hostname;
  };
  var arrayBuffersEqual = function arrayBuffersEqual(arrayBuffer1, arrayBuffer2) {
    if (arrayBuffer1 === arrayBuffer2) {
      return true;
    }

    if (arrayBuffer1.byteLength !== arrayBuffer2.byteLength) {
      return false;
    }

    var dataView1 = new DataView(arrayBuffer1);
    var dataView2 = new DataView(arrayBuffer2);

    for (var i = 0; i < dataView1.byteLength; i++) {
      if (dataView1.getUint8(i) !== dataView2.getUint8(i)) {
        return false;
      }
    }

    return true;
  };
  var arrayBufferFrom = function arrayBufferFrom(bufferOrTypedArray) {
    if (bufferOrTypedArray instanceof Uint8Array || bufferOrTypedArray instanceof Uint16Array) {
      return bufferOrTypedArray.buffer;
    }

    return bufferOrTypedArray;
  }; // Normalize between Video.js 6/7 (videojs.mergeOptions) and 8 (videojs.obj.merge).

  var merge = function merge() {
    var context = videojs.obj || videojs;
    var fn = context.merge || context.mergeOptions;

    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    return fn.apply(context, args);
  };
  var mergeAndRemoveNull = function mergeAndRemoveNull() {
    var result = merge.apply(void 0, arguments); // Any header whose value is `null` will be removed.

    Object.keys(result).forEach(function(k) {
      if (result[k] === null) {
        delete result[k];
      }
    });
    return result;
  };

  var httpResponseHandler = videojs.xhr.httpHandler; // to make sure this doesn't break with older versions of Video.js,
  // do a super simple wrapper instead

  if (!httpResponseHandler) {
    httpResponseHandler = function httpResponseHandler(callback, decodeResponseBody) {
      return function(err, response, responseBody) {
        if (err) {
          callback(err);
          return;
        } // if the HTTP status code is 4xx or 5xx, the request also failed


        if (response.statusCode >= 400 && response.statusCode <= 599) {
          var cause = responseBody;

          if (decodeResponseBody) {
            cause = String.fromCharCode.apply(null, new Uint8Array(responseBody));
          }

          callback({
            cause: cause
          });
          return;
        } // otherwise, request succeeded


        callback(null, responseBody);
      };
    };
  }

  /**
   * Parses the EME key message XML to extract HTTP headers and the Challenge element to use
   * in the PlayReady license request.
   *
   * @param {ArrayBuffer} message key message from EME
   * @return {Object} an object containing headers and the message body to use in the
   * license request
   */

  var getMessageContents = function getMessageContents(message) {
    // TODO do we want to support UTF-8?
    var xmlString = String.fromCharCode.apply(null, new Uint16Array(message));
    var xml = new window.DOMParser().parseFromString(xmlString, 'application/xml');
    var headersElement = xml.getElementsByTagName('HttpHeaders')[0];
    var headers = {};

    if (headersElement) {
      var headerNames = headersElement.getElementsByTagName('name');
      var headerValues = headersElement.getElementsByTagName('value');

      for (var i = 0; i < headerNames.length; i++) {
        headers[headerNames[i].childNodes[0].nodeValue] = headerValues[i].childNodes[0].nodeValue;
      }
    }

    var challengeElement = xml.getElementsByTagName('Challenge')[0];
    var challenge;

    if (challengeElement) {
      challenge = window.atob(challengeElement.childNodes[0].nodeValue);
    }

    return {
      headers: headers,
      message: challenge
    };
  };
  var requestPlayreadyLicense = function requestPlayreadyLicense(keySystemOptions, messageBuffer, emeOptions, callback) {
    var messageContents = getMessageContents(messageBuffer);
    var message = messageContents.message;
    var headers = mergeAndRemoveNull(messageContents.headers, emeOptions.emeHeaders, keySystemOptions.licenseHeaders);
    videojs.xhr({
      uri: keySystemOptions.url,
      method: 'post',
      headers: headers,
      body: message,
      responseType: 'arraybuffer'
    }, httpResponseHandler(callback, true));
  };

  /**
   * Returns an array of MediaKeySystemConfigurationObjects provided in the keySystem
   * options.
   *
   * @see {@link https://www.w3.org/TR/encrypted-media/#dom-mediakeysystemconfiguration|MediaKeySystemConfigurationObject}
   *
   * @param {Object} keySystemOptions
   *        Options passed into videojs-contrib-eme for a specific keySystem
   * @return {Object[]}
   *         Array of MediaKeySystemConfigurationObjects
   */

  var getSupportedConfigurations = function getSupportedConfigurations(keySystemOptions) {
    if (keySystemOptions.supportedConfigurations) {
      return keySystemOptions.supportedConfigurations;
    } // TODO use initDataTypes when appropriate


    var supportedConfiguration = {};
    var audioContentType = keySystemOptions.audioContentType;
    var audioRobustness = keySystemOptions.audioRobustness;
    var videoContentType = keySystemOptions.videoContentType;
    var videoRobustness = keySystemOptions.videoRobustness;
    var persistentState = keySystemOptions.persistentState;

    if (audioContentType || audioRobustness) {
      supportedConfiguration.audioCapabilities = [_extends({}, audioContentType ? {
        contentType: audioContentType
      } : {}, audioRobustness ? {
        robustness: audioRobustness
      } : {})];
    }

    if (videoContentType || videoRobustness) {
      supportedConfiguration.videoCapabilities = [_extends({}, videoContentType ? {
        contentType: videoContentType
      } : {}, videoRobustness ? {
        robustness: videoRobustness
      } : {})];
    }

    if (persistentState) {
      supportedConfiguration.persistentState = persistentState;
    }

    return [supportedConfiguration];
  };
  var getSupportedKeySystem = function getSupportedKeySystem(keySystems) {
    // As this happens after the src is set on the video, we rely only on the set src (we
    // do not change src based on capabilities of the browser in this plugin).
    var promise;
    Object.keys(keySystems).forEach(function(keySystem) {
      var supportedConfigurations = getSupportedConfigurations(keySystems[keySystem]);

      if (!promise) {
        promise = window.navigator.requestMediaKeySystemAccess(keySystem, supportedConfigurations);
      } else {
        promise = promise.catch(function(e) {
          return window.navigator.requestMediaKeySystemAccess(keySystem, supportedConfigurations);
        });
      }
    });
    return promise;
  };
  var makeNewRequest = function makeNewRequest(player, requestOptions) {
    var mediaKeys = requestOptions.mediaKeys,
      initDataType = requestOptions.initDataType,
      initData = requestOptions.initData,
      options = requestOptions.options,
      getLicense = requestOptions.getLicense,
      removeSession = requestOptions.removeSession,
      eventBus = requestOptions.eventBus;
    var keySession = mediaKeys.createSession();
    eventBus.trigger('keysessioncreated');
    player.on('dispose', function() {
      keySession.close();
    });
    return new Promise(function(resolve, reject) {
      keySession.addEventListener('message', function(event) {
        // all other types will be handled by keystatuseschange
        if (event.messageType !== 'license-request' && event.messageType !== 'license-renewal') {
          return;
        }

        getLicense(options, event.message).then(function(license) {
          resolve(keySession.update(license));
        }).catch(function(err) {
          reject(err);
        });
      }, false);
      keySession.addEventListener('keystatuseschange', function(event) {
        var expired = false; // based on https://www.w3.org/TR/encrypted-media/#example-using-all-events

        keySession.keyStatuses.forEach(function(status, keyId) {
          // Trigger an event so that outside listeners can take action if appropriate.
          // For instance, the `output-restricted` status should result in an
          // error being thrown.
          eventBus.trigger({
            keyId: keyId,
            status: status,
            target: keySession,
            type: 'keystatuschange'
          });

          switch (status) {
            case 'expired':
              // If one key is expired in a session, all keys are expired. From
              // https://www.w3.org/TR/encrypted-media/#dom-mediakeystatus-expired, "All other
              // keys in the session must have this status."
              expired = true;
              break;

            case 'internal-error':
              var message = 'Key status reported as "internal-error." Leaving the session open since we ' + 'don\'t have enough details to know if this error is fatal.'; // "This value is not actionable by the application."
              // https://www.w3.org/TR/encrypted-media/#dom-mediakeystatus-internal-error

              videojs.log.warn(message, event);
              break;
          }
        });

        if (expired) {
          // Close session and remove it from the session list to ensure that a new
          // session can be created.
          //
          // TODO convert to videojs.log.debug and add back in
          // https://github.com/videojs/video.js/pull/4780
          // videojs.log.debug('Session expired, closing the session.');
          keySession.close().then(function() {
            removeSession(initData);
            makeNewRequest(player, requestOptions);
          });
        }
      }, false);
      keySession.generateRequest(initDataType, initData).catch(function() {
        reject('Unable to create or initialize key session');
      });
    });
  };
  /*
   * Creates a new media key session if media keys are available, otherwise queues the
   * session creation for when the media keys are available.
   *
   * @see {@link https://www.w3.org/TR/encrypted-media/#dom-mediakeysession|MediaKeySession}
   * @see {@link https://www.w3.org/TR/encrypted-media/#dom-mediakeys|MediaKeys}
   *
   * @function addSession
   * @param {Object} video
   *        Target video element
   * @param {string} initDataType
   *        The type of init data provided
   * @param {Uint8Array} initData
   *        The media's init data
   * @param {Object} options
   *        Options provided to the plugin for this key system
   * @param {function()} [getLicense]
   *        User provided function to retrieve a license
   * @param {function()} removeSession
   *        Function to remove the persisted session on key expiration so that a new session
   *        may be created
   * @param {Object} eventBus
   *        Event bus for any events pertinent to users
   * @return {Promise}
   *         A resolved promise if session is waiting for media keys, or a promise for the
   *         session creation if media keys are available
   */

  var addSession = function addSession(_ref) {
    var player = _ref.player,
      video = _ref.video,
      initDataType = _ref.initDataType,
      initData = _ref.initData,
      options = _ref.options,
      getLicense = _ref.getLicense,
      removeSession = _ref.removeSession,
      eventBus = _ref.eventBus;

    if (video.mediaKeysObject) {
      return makeNewRequest(player, {
        mediaKeys: video.mediaKeysObject,
        initDataType: initDataType,
        initData: initData,
        options: options,
        getLicense: getLicense,
        removeSession: removeSession,
        eventBus: eventBus
      });
    }

    video.pendingSessionData.push({
      initDataType: initDataType,
      initData: initData,
      options: options,
      getLicense: getLicense,
      removeSession: removeSession,
      eventBus: eventBus
    });
    return Promise.resolve();
  };
  /*
   * Given media keys created from a key system access object, check for any session data
   * that was queued and create new sessions for each.
   *
   * @see {@link https://www.w3.org/TR/encrypted-media/#dom-mediakeysystemaccess|MediaKeySystemAccess}
   * @see {@link https://www.w3.org/TR/encrypted-media/#dom-mediakeysession|MediaKeySession}
   * @see {@link https://www.w3.org/TR/encrypted-media/#dom-mediakeys|MediaKeys}
   *
   * @function addPendingSessions
   * @param {Object} video
   *        Target video element
   * @param {string} [certificate]
   *        The server certificate (if used)
   * @param {Object} createdMediaKeys
   *        Media keys to use for session creation
   * @return {Promise}
   *         A promise containing new session creations and setting of media keys on the
   *         video object
   */

  var addPendingSessions = function addPendingSessions(_ref2) {
    var player = _ref2.player,
      video = _ref2.video,
      certificate = _ref2.certificate,
      createdMediaKeys = _ref2.createdMediaKeys;
    // save media keys on the video element to act as a reference for other functions so
    // that they don't recreate the keys
    video.mediaKeysObject = createdMediaKeys;
    var promises = [];

    if (certificate) {
      promises.push(createdMediaKeys.setServerCertificate(certificate));
    }

    for (var i = 0; i < video.pendingSessionData.length; i++) {
      var data = video.pendingSessionData[i];
      promises.push(makeNewRequest(player, {
        mediaKeys: video.mediaKeysObject,
        initDataType: data.initDataType,
        initData: data.initData,
        options: data.options,
        getLicense: data.getLicense,
        removeSession: data.removeSession,
        eventBus: data.eventBus
      }));
    }

    video.pendingSessionData = [];
    promises.push(video.setMediaKeys(createdMediaKeys));
    return Promise.all(promises);
  };

  var defaultPlayreadyGetLicense = function defaultPlayreadyGetLicense(keySystemOptions) {
    return function(emeOptions, keyMessage, callback) {
      requestPlayreadyLicense(keySystemOptions, keyMessage, emeOptions, callback);
    };
  };

  var defaultGetLicense = function defaultGetLicense(keySystemOptions) {
    return function(emeOptions, keyMessage, callback) {
      var headers = mergeAndRemoveNull({
        'Content-type': 'application/octet-stream'
      }, emeOptions.emeHeaders, keySystemOptions.licenseHeaders);
      videojs.xhr({
        uri: keySystemOptions.url,
        method: 'POST',
        responseType: 'arraybuffer',
        body: keyMessage,
        headers: headers
      }, httpResponseHandler(callback, true));
    };
  };

  var promisifyGetLicense = function promisifyGetLicense(getLicenseFn, eventBus) {
    return function(emeOptions, keyMessage) {
      return new Promise(function(resolve, reject) {
        getLicenseFn(emeOptions, keyMessage, function(err, license) {
          if (eventBus) {
            eventBus.trigger('licenserequestattempted');
          }

          if (err) {
            reject(err);
            return;
          }

          resolve(license);
        });
      });
    };
  };

  var standardizeKeySystemOptions = function standardizeKeySystemOptions(keySystem, keySystemOptions) {
    if (typeof keySystemOptions === 'string') {
      keySystemOptions = {
        url: keySystemOptions
      };
    }

    if (!keySystemOptions.url && !keySystemOptions.getLicense) {
      throw new Error('Neither URL nor getLicense function provided to get license');
    }

    if (keySystemOptions.url && !keySystemOptions.getLicense) {
      keySystemOptions.getLicense = keySystem === 'com.microsoft.playready' ? defaultPlayreadyGetLicense(keySystemOptions) : defaultGetLicense(keySystemOptions);
    }

    return keySystemOptions;
  };

  var standard5July2016 = function standard5July2016(_ref3) {
    var player = _ref3.player,
      video = _ref3.video,
      initDataType = _ref3.initDataType,
      initData = _ref3.initData,
      keySystemAccess = _ref3.keySystemAccess,
      options = _ref3.options,
      removeSession = _ref3.removeSession,
      eventBus = _ref3.eventBus;
    var keySystemPromise = Promise.resolve();

    if (typeof video.mediaKeysObject === 'undefined') {
      // Prevent entering this path again.
      video.mediaKeysObject = null; // Will store all initData until the MediaKeys is ready.

      video.pendingSessionData = [];
      var certificate;
      var keySystemOptions;
      keySystemPromise = new Promise(function(resolve, reject) {
        // save key system for adding sessions
        video.keySystem = keySystemAccess.keySystem;
        keySystemOptions = standardizeKeySystemOptions(keySystemAccess.keySystem, options.keySystems[keySystemAccess.keySystem]);

        if (!keySystemOptions.getCertificate) {
          resolve(keySystemAccess);
          return;
        }

        keySystemOptions.getCertificate(options, function(err, cert) {
          if (err) {
            reject(err);
            return;
          }

          certificate = cert;
          resolve();
        });
      }).then(function() {
        return keySystemAccess.createMediaKeys();
      }).then(function(createdMediaKeys) {
        return addPendingSessions({
          player: player,
          video: video,
          certificate: certificate,
          createdMediaKeys: createdMediaKeys
        });
      }).catch(function(err) {
        // if we have a specific error message, use it, otherwise show a more
        // generic one
        if (err) {
          return Promise.reject(err);
        }

        return Promise.reject('Failed to create and initialize a MediaKeys object');
      });
    }

    return keySystemPromise.then(function() {
      var _standardizeKeySystem = standardizeKeySystemOptions(video.keySystem, options.keySystems[video.keySystem]),
        getLicense = _standardizeKeySystem.getLicense;

      return addSession({
        player: player,
        video: video,
        initDataType: initDataType,
        initData: initData,
        options: options,
        // if key system has not been determined then addSession doesn't need getLicense
        getLicense: video.keySystem ? promisifyGetLicense(getLicense, eventBus) : null,
        removeSession: removeSession,
        eventBus: eventBus
      });
    });
  };

  /**
   * The W3C Working Draft of 22 October 2013 seems to be the best match for
   * the ms-prefixed API. However, it should only be used as a guide; it is
   * doubtful the spec is 100% implemented as described.
   *
   * @see https://www.w3.org/TR/2013/WD-encrypted-media-20131022
   */
  var FAIRPLAY_KEY_SYSTEM = 'com.apple.fps.1_0';

  var concatInitDataIdAndCertificate = function concatInitDataIdAndCertificate(_ref) {
    var initData = _ref.initData,
      id = _ref.id,
      cert = _ref.cert;

    if (typeof id === 'string') {
      id = stringToUint16Array(id);
    } // layout:
    //   [initData]
    //   [4 byte: idLength]
    //   [idLength byte: id]
    //   [4 byte:certLength]
    //   [certLength byte: cert]


    var offset = 0;
    var buffer = new ArrayBuffer(initData.byteLength + 4 + id.byteLength + 4 + cert.byteLength);
    var dataView = new DataView(buffer);
    var initDataArray = new Uint8Array(buffer, offset, initData.byteLength);
    initDataArray.set(initData);
    offset += initData.byteLength;
    dataView.setUint32(offset, id.byteLength, true);
    offset += 4;
    var idArray = new Uint16Array(buffer, offset, id.length);
    idArray.set(id);
    offset += idArray.byteLength;
    dataView.setUint32(offset, cert.byteLength, true);
    offset += 4;
    var certArray = new Uint8Array(buffer, offset, cert.byteLength);
    certArray.set(cert);
    return new Uint8Array(buffer, 0, buffer.byteLength);
  };

  var addKey = function addKey(_ref2) {
    var video = _ref2.video,
      contentId = _ref2.contentId,
      initData = _ref2.initData,
      cert = _ref2.cert,
      options = _ref2.options,
      getLicense = _ref2.getLicense,
      eventBus = _ref2.eventBus;
    return new Promise(function(resolve, reject) {
      if (!video.webkitKeys) {
        try {
          video.webkitSetMediaKeys(new window.WebKitMediaKeys(FAIRPLAY_KEY_SYSTEM));
        } catch (error) {
          reject('Could not create MediaKeys');
          return;
        }
      }

      var keySession;

      try {
        keySession = video.webkitKeys.createSession('video/mp4', concatInitDataIdAndCertificate({
          id: contentId,
          initData: initData,
          cert: cert
        }));
      } catch (error) {
        reject('Could not create key session');
        return;
      }

      eventBus.trigger('keysessioncreated');
      keySession.contentId = contentId;
      keySession.addEventListener('webkitkeymessage', function(event) {
        getLicense(options, contentId, event.message, function(err, license) {
          if (eventBus) {
            eventBus.trigger('licenserequestattempted');
          }

          if (err) {
            reject(err);
            return;
          }

          keySession.update(new Uint8Array(license));
        });
      });
      keySession.addEventListener('webkitkeyadded', function() {
        resolve();
      }); // for testing purposes, adding webkitkeyerror must be the last item in this method

      keySession.addEventListener('webkitkeyerror', function() {
        var error = keySession.error;
        reject("KeySession error: code " + error.code + ", systemCode " + error.systemCode);
      });
    });
  };

  var defaultGetCertificate = function defaultGetCertificate(fairplayOptions) {
    return function(emeOptions, callback) {
      var headers = mergeAndRemoveNull(emeOptions.emeHeaders, fairplayOptions.certificateHeaders);
      videojs.xhr({
        uri: fairplayOptions.certificateUri,
        responseType: 'arraybuffer',
        headers: headers
      }, httpResponseHandler(function(err, license) {
        if (err) {
          callback(err);
          return;
        } // in this case, license is still the raw ArrayBuffer,
        // (we don't want httpResponseHandler to decode it)
        // convert it into Uint8Array as expected


        callback(null, new Uint8Array(license));
      }));
    };
  };

  var defaultGetContentId = function defaultGetContentId(emeOptions, initData) {
    return getHostnameFromUri(uint8ArrayToString(initData));
  };

  var defaultGetLicense$1 = function defaultGetLicense(fairplayOptions) {
    return function(emeOptions, contentId, keyMessage, callback) {
      var headers = mergeAndRemoveNull({
        'Content-type': 'application/octet-stream'
      }, emeOptions.emeHeaders, fairplayOptions.licenseHeaders);
      videojs.xhr({
        uri: fairplayOptions.licenseUri,
        method: 'POST',
        responseType: 'arraybuffer',
        body: keyMessage,
        headers: headers
      }, httpResponseHandler(callback, true));
    };
  };

  var fairplay = function fairplay(_ref3) {
    var video = _ref3.video,
      initData = _ref3.initData,
      options = _ref3.options,
      eventBus = _ref3.eventBus;
    var fairplayOptions = options.keySystems[FAIRPLAY_KEY_SYSTEM];
    var getCertificate = fairplayOptions.getCertificate || defaultGetCertificate(fairplayOptions);
    var getContentId = fairplayOptions.getContentId || defaultGetContentId;
    var getLicense = fairplayOptions.getLicense || defaultGetLicense$1(fairplayOptions);
    return new Promise(function(resolve, reject) {
      getCertificate(options, function(err, cert) {
        if (err) {
          reject(err);
          return;
        }

        resolve(cert);
      });
    }).then(function(cert) {
      return addKey({
        video: video,
        cert: cert,
        initData: initData,
        getLicense: getLicense,
        options: options,
        contentId: getContentId(options, initData),
        eventBus: eventBus
      });
    });
  };

  /**
   * The W3C Working Draft of 22 October 2013 seems to be the best match for
   * the ms-prefixed API. However, it should only be used as a guide; it is
   * doubtful the spec is 100% implemented as described.
   *
   * @see https://www.w3.org/TR/2013/WD-encrypted-media-20131022
   * @see https://docs.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/compatibility/mt598601(v=vs.85)
   */
  var PLAYREADY_KEY_SYSTEM = 'com.microsoft.playready';
  var addKeyToSession = function addKeyToSession(options, session, event, eventBus) {
    var playreadyOptions = options.keySystems[PLAYREADY_KEY_SYSTEM];

    if (typeof playreadyOptions.getKey === 'function') {
      playreadyOptions.getKey(options, event.destinationURL, event.message.buffer, function(err, key) {
        if (err) {
          eventBus.trigger({
            message: 'Unable to get key: ' + err,
            target: session,
            type: 'mskeyerror'
          });
          return;
        }

        session.update(key);
      });
      return;
    }

    if (typeof playreadyOptions === 'string') {
      playreadyOptions = {
        url: playreadyOptions
      };
    } else if (typeof playreadyOptions === 'boolean') {
      playreadyOptions = {};
    }

    if (!playreadyOptions.url) {
      playreadyOptions.url = event.destinationURL;
    }

    var callback = function callback(err, responseBody) {
      if (eventBus) {
        eventBus.trigger('licenserequestattempted');
      }

      if (err) {
        eventBus.trigger({
          message: 'Unable to request key from url: ' + playreadyOptions.url,
          target: session,
          type: 'mskeyerror'
        });
        return;
      }

      session.update(new Uint8Array(responseBody));
    };

    if (playreadyOptions.getLicense) {
      playreadyOptions.getLicense(options, event.message.buffer, callback);
    } else {
      requestPlayreadyLicense(playreadyOptions, event.message.buffer, options, callback);
    }
  };
  var createSession = function createSession(video, initData, options, eventBus) {
    // Note: invalid mime type passed here throws a NotSupportedError
    var session = video.msKeys.createSession('video/mp4', initData);

    if (!session) {
      throw new Error('Could not create key session.');
    }

    eventBus.trigger('keysessioncreated'); // Note that mskeymessage may not always be called for PlayReady:
    //
    // "If initData contains a PlayReady object that contains an OnDemand header, only a
    // keyAdded event is returned (as opposed to a keyMessage event as described in the
    // Encrypted Media Extension draft). Similarly, if initData contains a PlayReady object
    // that contains a key identifier in the hashed data storage (HDS), only a keyAdded
    // event is returned."
    // eslint-disable-next-line max-len
    // @see [PlayReady License Acquisition]{@link https://msdn.microsoft.com/en-us/library/dn468979.aspx}

    session.addEventListener('mskeymessage', function(event) {
      addKeyToSession(options, session, event, eventBus);
    });
    session.addEventListener('mskeyerror', function(event) {
      eventBus.trigger({
        message: 'Unexpected key error from key session with ' + ("code: " + session.error.code + " and systemCode: " + session.error.systemCode),
        target: session,
        type: 'mskeyerror'
      });
    });
    session.addEventListener('mskeyadded', function() {
      eventBus.trigger({
        target: session,
        type: 'mskeyadded'
      });
    });
  };
  var msPrefixed = (function(_ref) {
    var video = _ref.video,
      initData = _ref.initData,
      options = _ref.options,
      eventBus = _ref.eventBus;

    // Although by the standard examples the presence of video.msKeys is checked first to
    // verify that we aren't trying to create a new session when one already exists, here
    // sessions are managed earlier (on the player.eme object), meaning that at this point
    // any existing keys should be cleaned up.
    // TODO: Will this break rotation? Is it safe?
    if (video.msKeys) {
      delete video.msKeys;
    }

    try {
      video.msSetMediaKeys(new window.MSMediaKeys(PLAYREADY_KEY_SYSTEM));
    } catch (e) {
      throw new Error('Unable to create media keys for PlayReady key system. ' + 'Error: ' + e.message);
    }

    createSession(video, initData, options, eventBus);
  });

  var version = "3.11.1";

  var hasSession = function hasSession(sessions, initData) {
    for (var i = 0; i < sessions.length; i++) {
      // Other types of sessions may be in the sessions array that don't store the initData
      // (for instance, PlayReady sessions on IE11).
      if (!sessions[i].initData) {
        continue;
      } // initData should be an ArrayBuffer by the spec:
      // eslint-disable-next-line max-len
      // @see [Media Encrypted Event initData Spec]{@link https://www.w3.org/TR/encrypted-media/#mediaencryptedeventinit}
      //
      // However, on some browsers it may come back with a typed array view of the buffer.
      // This is the case for IE11, however, since IE11 sessions are handled differently
      // (following the msneedkey PlayReady path), this coversion may not be important. It
      // is safe though, and might be a good idea to retain in the short term (until we have
      // catalogued the full range of browsers and their implementations).


      var sessionBuffer = arrayBufferFrom(sessions[i].initData);
      var initDataBuffer = arrayBufferFrom(initData);

      if (arrayBuffersEqual(sessionBuffer, initDataBuffer)) {
        return true;
      }
    }

    return false;
  };
  var removeSession = function removeSession(sessions, initData) {
    for (var i = 0; i < sessions.length; i++) {
      if (sessions[i].initData === initData) {
        sessions.splice(i, 1);
        return;
      }
    }
  };
  var handleEncryptedEvent = function handleEncryptedEvent(player, event, options, sessions, eventBus) {
    if (!options || !options.keySystems) {
      // return silently since it may be handled by a different system
      return Promise.resolve();
    }

    var initData = event.initData;
    return getSupportedKeySystem(options.keySystems).then(function(keySystemAccess) {
      var keySystem = keySystemAccess.keySystem; // Use existing init data from options if provided

      if (options.keySystems[keySystem] && options.keySystems[keySystem].pssh) {
        initData = options.keySystems[keySystem].pssh;
      } // "Initialization Data must be a fixed value for a given set of stream(s) or media
      // data. It must only contain information related to the keys required to play a given
      // set of stream(s) or media data."
      // eslint-disable-next-line max-len
      // @see [Initialization Data Spec]{@link https://www.w3.org/TR/encrypted-media/#initialization-data}


      if (hasSession(sessions, initData) || !initData) {
        // TODO convert to videojs.log.debug and add back in
        // https://github.com/videojs/video.js/pull/4780
        // videojs.log('eme',
        //             'Already have a configured session for init data, ignoring event.');
        return Promise.resolve();
      }

      sessions.push({
        initData: initData
      });
      return standard5July2016({
        player: player,
        video: event.target,
        initDataType: event.initDataType,
        initData: initData,
        keySystemAccess: keySystemAccess,
        options: options,
        removeSession: removeSession.bind(null, sessions),
        eventBus: eventBus
      });
    });
  };
  var handleWebKitNeedKeyEvent = function handleWebKitNeedKeyEvent(event, options, eventBus) {
    if (!options.keySystems || !options.keySystems[FAIRPLAY_KEY_SYSTEM] || !event.initData) {
      // return silently since it may be handled by a different system
      return Promise.resolve();
    } // From Apple's example Safari FairPlay integration code, webkitneedkey is not repeated
    // for the same content. Unless documentation is found to present the opposite, handle
    // all webkitneedkey events the same (even if they are repeated).


    return fairplay({
      video: event.target,
      initData: event.initData,
      options: options,
      eventBus: eventBus
    });
  };
  var handleMsNeedKeyEvent = function handleMsNeedKeyEvent(event, options, sessions, eventBus) {
    if (!options.keySystems || !options.keySystems[PLAYREADY_KEY_SYSTEM]) {
      // return silently since it may be handled by a different system
      return;
    } // "With PlayReady content protection, your Web app must handle the first needKey event,
    // but it must then ignore any other needKey event that occurs."
    // eslint-disable-next-line max-len
    // @see [PlayReady License Acquisition]{@link https://msdn.microsoft.com/en-us/library/dn468979.aspx}
    //
    // Usually (and as per the example in the link above) this is determined by checking for
    // the existence of video.msKeys. However, since the video element may be reused, it's
    // easier to directly manage the session.


    if (sessions.reduce(function(acc, session) {
      return acc || session.playready;
    }, false)) {
      // TODO convert to videojs.log.debug and add back in
      // https://github.com/videojs/video.js/pull/4780
      // videojs.log('eme',
      //             'An \'msneedkey\' event was receieved earlier, ignoring event.');
      return;
    }

    var initData = event.initData; // Use existing init data from options if provided

    if (options.keySystems[PLAYREADY_KEY_SYSTEM] && options.keySystems[PLAYREADY_KEY_SYSTEM].pssh) {
      initData = options.keySystems[PLAYREADY_KEY_SYSTEM].pssh;
    }

    if (!initData) {
      return;
    }

    sessions.push({
      playready: true,
      initData: initData
    });
    msPrefixed({
      video: event.target,
      initData: initData,
      options: options,
      eventBus: eventBus
    });
  };
  var getOptions = function getOptions(player) {
    return merge(player.currentSource(), player.eme.options);
  };
  /**
   * Configure a persistent sessions array and activeSrc property to ensure we properly
   * handle each independent source's events. Should be run on any encrypted or needkey
   * style event to ensure that the sessions reflect the active source.
   *
   * @function setupSessions
   * @param    {Player} player
   */

  var setupSessions = function setupSessions(player) {
    var src = player.src();

    if (src !== player.eme.activeSrc) {
      player.eme.activeSrc = src;
      player.eme.sessions = [];
    }
  };
  /**
   * Construct a simple function that can be used to dispatch EME errors on the
   * player directly, such as providing it to a `.catch()`.
   *
   * @function emeErrorHandler
   * @param    {Player} player
   * @return   {Function}
   */

  var emeErrorHandler = function emeErrorHandler(player) {
    return function(objOrErr) {
      var error = {
        // MEDIA_ERR_ENCRYPTED is code 5
        code: 5
      };

      if (typeof objOrErr === 'string') {
        error.message = objOrErr;
      } else if (objOrErr) {
        if (objOrErr.message) {
          error.message = objOrErr.message;
        }

        if (objOrErr.cause && (objOrErr.cause.length || objOrErr.cause.byteLength)) {
          error.cause = objOrErr.cause;
        }
      }

      player.error(error);
    };
  };
  /**
   * Function to invoke when the player is ready.
   *
   * This is a great place for your plugin to initialize itself. When this
   * function is called, the player will have its DOM and child components
   * in place.
   *
   * @function onPlayerReady
   * @param    {Player} player
   * @param    {Function} emeError
   */

  var onPlayerReady = function onPlayerReady(player, emeError) {
    if (player.$('.vjs-tech').tagName.toLowerCase() !== 'video') {
      return;
    }

    setupSessions(player);

    if (window.WebKitMediaKeys) {
      var handleFn = function handleFn(event) {
        // TODO convert to videojs.log.debug and add back in
        // https://github.com/videojs/video.js/pull/4780
        // videojs.log('eme', 'Received a \'webkitneedkey\' event');
        // TODO it's possible that the video state must be cleared if reusing the same video
        // element between sources
        setupSessions(player);
        handleWebKitNeedKeyEvent(event, getOptions(player), player.tech_).catch(emeError);
      }; // Support Safari EME with FairPlay
      // (also used in early Chrome or Chrome with EME disabled flag)


      player.tech_.el_.addEventListener('webkitneedkey', function(event) {
        var options = getOptions(player);
        var firstWebkitneedkeyTimeout = options.firstWebkitneedkeyTimeout || 1000;
        var src = player.src(); // on source change or first startup reset webkitneedkey options.

        player.eme.webkitneedkey_ = player.eme.webkitneedkey_ || {}; // if the source changed we need to handle the first event again.
        // track source changes internally.

        if (player.eme.webkitneedkey_.src !== src) {
          player.eme.webkitneedkey_ = {
            handledFirstEvent: false,
            src: src
          };
        } // It's possible that at the start of playback a rendition switch
        // on a small player in safari's HLS implementation will cause
        // two webkitneedkey events to occur. We want to make sure to cancel
        // our first existing request if we get another within 1 second. This
        // prevents a non-fatal player error from showing up due to a
        // request failure.


        if (!player.eme.webkitneedkey_.handledFirstEvent) {
          // clear the old timeout so that a new one can be created
          // with the new rendition's event data
          player.clearTimeout(player.eme.webkitneedkey_.timeout);
          player.eme.webkitneedkey_.timeout = player.setTimeout(function() {
            player.eme.webkitneedkey_.handledFirstEvent = true;
            player.eme.webkitneedkey_.timeout = null;
            handleFn(event);
          }, firstWebkitneedkeyTimeout); // after we have a verified first request, we will request on
          // every other event like normal.
        } else {
          handleFn(event);
        }
      });
    } else if (window.MediaKeys) {
      // Support EME 05 July 2016
      // Chrome 42+, Firefox 47+, Edge, Safari 12.1+ on macOS 10.14+
      player.tech_.el_.addEventListener('encrypted', function(event) {
        // TODO convert to videojs.log.debug and add back in
        // https://github.com/videojs/video.js/pull/4780
        // videojs.log('eme', 'Received an \'encrypted\' event');
        setupSessions(player);
        handleEncryptedEvent(player, event, getOptions(player), player.eme.sessions, player.tech_).catch(emeError);
      });
    } else if (window.MSMediaKeys) {
      // IE11 Windows 8.1+
      // Since IE11 doesn't support promises, we have to use a combination of
      // try/catch blocks and event handling to simulate promise rejection.
      // Functionally speaking, there should be no discernible difference between
      // the behavior of IE11 and those of other browsers.
      player.tech_.el_.addEventListener('msneedkey', function(event) {
        // TODO convert to videojs.log.debug and add back in
        // https://github.com/videojs/video.js/pull/4780
        // videojs.log('eme', 'Received an \'msneedkey\' event');
        setupSessions(player);

        try {
          handleMsNeedKeyEvent(event, getOptions(player), player.eme.sessions, player.tech_);
        } catch (error) {
          emeError(error);
        }
      });
      player.tech_.on('mskeyerror', emeError); // TODO: refactor this plugin so it can use a plugin dispose

      player.on('dispose', function() {
        player.tech_.off('mskeyerror', emeError);
      });
    }
  };
  /**
   * A video.js plugin.
   *
   * In the plugin function, the value of `this` is a video.js `Player`
   * instance. You cannot rely on the player being in a "ready" state here,
   * depending on how the plugin is invoked. This may or may not be important
   * to you; if not, remove the wait for "ready"!
   *
   * @function eme
   * @param    {Object} [options={}]
   *           An object of options left to the plugin author to define.
   */


  var eme = function eme(options) {
    if (options === void 0) {
      options = {};
    }

    var player = this;
    var emeError = emeErrorHandler(player);
    player.ready(function() {
      return onPlayerReady(player, emeError);
    }); // Plugin API

    player.eme = {
      /**
      * Sets up MediaKeys on demand
      * Works around https://bugs.chromium.org/p/chromium/issues/detail?id=895449
      *
      * @function initializeMediaKeys
      * @param    {Object} [emeOptions={}]
      *           An object of eme plugin options.
      * @param    {Function} [callback=function(){}]
      * @param    {boolean} [suppressErrorIfPossible=false]
      */
      initializeMediaKeys: function initializeMediaKeys(emeOptions, callback, suppressErrorIfPossible) {
        if (emeOptions === void 0) {
          emeOptions = {};
        }

        if (callback === void 0) {
          callback = function callback() { };
        }

        if (suppressErrorIfPossible === void 0) {
          suppressErrorIfPossible = false;
        }

        // TODO: this should be refactored and renamed to be less tied
        // to encrypted events
        var mergedEmeOptions = merge(player.currentSource(), options, emeOptions); // fake an encrypted event for handleEncryptedEvent

        var mockEncryptedEvent = {
          initDataType: 'cenc',
          initData: null,
          target: player.tech_.el_
        };
        setupSessions(player);

        if (player.tech_.el_.setMediaKeys) {
          handleEncryptedEvent(player, mockEncryptedEvent, mergedEmeOptions, player.eme.sessions, player.tech_).then(function() {
            return callback();
          }).catch(function(error) {
            callback(error);

            if (!suppressErrorIfPossible) {
              emeError(error);
            }
          });
        } else if (player.tech_.el_.msSetMediaKeys) {
          var msKeyHandler = function msKeyHandler(event) {
            player.tech_.off('mskeyadded', msKeyHandler);
            player.tech_.off('mskeyerror', msKeyHandler);

            if (event.type === 'mskeyerror') {
              callback(event.target.error);

              if (!suppressErrorIfPossible) {
                emeError(event.message);
              }
            } else {
              callback();
            }
          };

          player.tech_.one('mskeyadded', msKeyHandler);
          player.tech_.one('mskeyerror', msKeyHandler);

          try {
            handleMsNeedKeyEvent(mockEncryptedEvent, mergedEmeOptions, player.eme.sessions, player.tech_);
          } catch (error) {
            player.tech_.off('mskeyadded', msKeyHandler);
            player.tech_.off('mskeyerror', msKeyHandler);
            callback(error);

            if (!suppressErrorIfPossible) {
              emeError(error);
            }
          }
        }
      },
      options: options
    };
  }; // Register the plugin with video.js.


  videojs.registerPlugin('eme', eme); // Include the version number.

  eme.VERSION = version;

  exports.hasSession = hasSession;
  exports.removeSession = removeSession;
  exports.handleEncryptedEvent = handleEncryptedEvent;
  exports.handleWebKitNeedKeyEvent = handleWebKitNeedKeyEvent;
  exports.handleMsNeedKeyEvent = handleMsNeedKeyEvent;
  exports.getOptions = getOptions;
  exports.setupSessions = setupSessions;
  exports.emeErrorHandler = emeErrorHandler;
  exports.default = eme;

  Object.defineProperty(exports, '__esModule', { value: true });

})));
