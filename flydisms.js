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
							streams .some (function (s) {
								if (s .hasVal) {
									self (s ());
									return true;
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
					
var from_promise =	function (p) {
						var s = stream ();
						p .then (s) .then (function () { s .end (true) });
						return s;
					};
var project =	function (to, s) {
					s
						.thru (tap, to)
						.end .thru (tap, function () {
							to .end (true);
						})
					return s;
				}
				
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