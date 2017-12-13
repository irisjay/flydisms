var stream =	function (x) {
					if (arguments .length)
						return flyd .stream (x);
					else
						return flyd .stream ();
				}
var trans = flyd .transduce;
var combine = flyd .combine;
var curry = flyd .curryN;

var mechanism = 	function (mechanism, sources) {
						return	combine (function (self, deps_changed) {
									self (mechanism (self, deps_changed))
								}, sources)
					};

var none = stream (); none .end (true);
var forever = stream ();
var now = function (x) { return stream (x || undefined) };


var mergeAll =	function (streams) {
					var s = flyd .immediate (combine (function (self, changed) {
						if (changed .length) {
							changed .forEach (function (change) {
								self (change ())
							})
						}
						else {
							streams .forEach (function (s) {
								if (s .hasVal) {
									self (s ());
								}
							});
						}
					}, streams));
					flyd .endsOn (combine (function () {
						return true;
					}, streams .map (function (sm) { return sm .end ? sm .end : sm; })), s);
					return s;
				};

var filter =	curry (2, function (fn, s) {
					return combine (function (self) {
						if (fn (s ())) {
							self (s .val);
						}
					}, [s]);
				});

var spread =	function (s) {
					return	combine (function (self) {
								s () .forEach (self);
							}, [s])
				}
	
var dropRepeatsWith_ =	function (eq, s) {
							var prev;
							return combine (function (self) {
								if (! self .hasVal || ! eq (s .val, prev)) {
									prev = s .val;
									self (s .val);
								}
							}, [s]);
						}

var dropRepeats =	dropRepeatsWith_ .bind (null, function (a, b) {
						return a === b;
					});
var dropRepeatsWith = curry (2, dropRepeatsWith_);



var promise =	function (stream) {
					var resolve;
					var promise = new Promise (function (res) { resolve = res; })
					var listener = stream .thru (flyd .on, resolve);
					listener .end && promise .then (function () { listener .end (true); })
					return promise;
				}
							
var delay = curry (2, function (dur, s) {
				return combine (function (self) {
					var value = s ();
					setTimeout (function() {
						self (value);
					}, dur);
				}, [s]);
			});

var throttle =	curry (2, function (dur, s) {
					var scheduled;
					return combine (function (self) {
						if (! scheduled) {
							self (s ());
							scheduled = setTimeout (function() {
								scheduled = undefined;
							}, dur);
						}
					}, [s]);
				});
var right_throttle =	curry (2, function (dur, s) {
							var scheduled;
							return combine (function (self) {
								if (! scheduled) {
									self (s ());
									scheduled = setTimeout (function() {
										scheduled = undefined;
										self (s ());
									}, dur);
								}
							}, [s]);
						});

var afterSilence =	curry (2, function (dur, s) {
						var scheduled;
						var buffer = [];
						return combine (function (self) {
							buffer .push (s ());
							clearTimeout (scheduled);
							scheduled = setTimeout (function() {
								self (buffer);
								buffer = [];
							}, dur);
						}, [s]);
					});

var every =	function (dur) {
				var s = stream ();
				var target = Date .now();
				var timer =	function () {
								if (! s .end ()) {
									var now = Date .now ();
									target += dur;
									s (now);
									setTimeout (timer, target - now);
								}
							}
				timer ();
				return s;
			};

var tap =	function (affect, stream) {
				if (stream .end) {
					if (! stream .end ()) {
						var effect = flyd .on (affect, stream);
						flyd .on (effect .end, stream .end)	
					}
				}
				else {
					if (! stream ()) {
						var effect = flyd .on (affect, stream);
						flyd .on (effect .end, stream)
					}
				}
				return stream;
			};

var takeUntil = curry (2, function (term, src) {
					return flyd .endsOn (mergeAll ([term, src .end ? src .end : src]), src .thru (map, id));
				});

var map =	curry (2, function (f, s) {
				return combine (function (self) {
					self (f (s .val));
				}, [s]);
			})

var scan =	curry (3, function (f, acc, s) {
				var ns = combine (function (self) {
					self (acc = f (acc, s .val));
				}, [s]);
				if (! ns .hasVal)
					ns(acc);
				return ns;
			});

var news =  function (s) {
				if (s .hasVal) {
					return	s .thru (trans, R .drop (1));
				}
				else
					return	s .thru (trans, R .drop (0))
			};

var flatMap =	curry (2, function (f, s) {
					// Internal state to end flat map stream
					var flatEnd = stream (1);
					var internalEnded = flyd .on (function() {
						var alive = flatEnd () - 1;
						flatEnd (alive);
						if (alive <= 0) {
							flatEnd .end (true);
						}
					});
				
					internalEnded (s .end);
				
					var flatStream = combine (function (own) {
						// Our fn stream makes streams
						var newS = f (s ());
						flatEnd (flatEnd () + 1);
						internalEnded (newS .end);
				
						// Update self on call -- newS is never handed out so deps don't matter
						flyd .on (own, newS);
					}, [s]);
				
					flyd .endsOn (flatEnd .end, flatStream);
				
					return flatStream;
				});
				
				
var next =  function (s) {
				var str = stream ();
				promise (news (s)) .then (function (x) {
					str (x);
					str .end (true);
				})
				return str;
			};
			
var switchLatest =	function (s) {
						return	combine (function (self) {
									s ()
										.thru (takeUntil, news (s))
										.thru (tap, self)
								}, [s]);
					};
var stream_merge =	function (s) {
                        var self = stream ();
                        var n = stream (0);
                        s .thru (tap, function () {
                            if (! s () .end ()) {
                                n (n () + 1);
                                s ()
                                    .thru (tap, self)
                                    .end
                                        .thru (tap, function () {
                                            n (n () - 1);
                                        })
                            }
                        });
                        var ended = function () {
                            return n () === 0 && s .end ()
                        };
                        mergeAll ([
                            n .thru (map, ended),
                            s .end .thru (map, ended)
                        ]) .thru (filter, R .identity)
                        .thru (trans, R .take (1))
                        .thru (tap, function () {
                            self .end (true);
                        });
						return self;
					};
					
var from_promise =	function (p) {
						var s = stream ();
						p .then (s) .then (function () { s .end (true) });
						return s;
					};
var project =	R .curry (function (to, s) {
                    if (s .end ())
                        to .end (true);
                    else {
    					s
    						.thru (tap, to)
    						.end .thru (tap, function () {
    							to .end (true);
    						})
                    }
					return s;
				})
var reflect = R .flip (project);
				
var from =	function (pushes) {
				var s = stream ();
				pushes (s);
				return s;
			};
var stream_pushes =	from;
var begins_with =	function (what, s) {
						if (! s .hasVal)
							s (what)
						return s;
					}
var _begins_with = begins_with;

var concat_on =	function (ender, s) {
					var _ = stream (s);
					s .end .thru (tap, function () {
						_ (ender ());	
					});
					return _ .thru (switchLatest);
				}
				
var split_on =	function (splitter, s) {
	return	splitter .thru (map, function (x) {
		return news (s) .thru (takeUntil, news (splitter));
	})
}

var only_ =	function (x) {
	return function (_) {
	    _ (x);
	    _ .end (true);
	};
}

var product = function (ss) {
	return stream_pushes (function (p) {
		p (R .map (function (s) {
		    return s ()
		}, ss));
		R .forEachObjIndexed (function (s, k) {
			s .thru (tap, function (x) {
				p (
					R .assoc (k, x) (p ()))
			})
		}) (ss);
	})
}
var array_product = function (ss) {
	return stream_pushes (function (p) {
		p (ss .map (function (s) {
		    return s ();
		}));
		R .forEach (function (s, k) {
			s .thru (tap, function (x) {
				p (
					R .update (k, x) (p ()))
			})
		}) (ss)
	})
}


var key_sum = function (s1) {
	return function (s2) {
		return stream_pushes (function (e) {
			e ({});
			s1 .thru (tap, function (s) {
				var _ = e ();
				R .forEachObjIndexed (function (v, k) {
					_ = R .assoc (k, v) (_)
				}) (s)
				e (_);
			});
			s2 .thru (tap, function (s) {
				var _ = e ();
				R .forEachObjIndexed (function (v, k) {
					_ = R .assoc (k, v) (_)
				}) (s)
				e (_);
			})
		})
	}
}