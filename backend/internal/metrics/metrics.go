// Package metrics implements a small Prometheus exposition endpoint without
// adding a third-party runtime dependency to the application.
package metrics

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var histogramBounds = []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10}

type key struct {
	method string
	route  string
	status string
}

type observation struct {
	count   uint64
	sum     float64
	buckets []uint64 // cumulative buckets, matching histogramBounds
}

type Registry struct {
	mu        sync.RWMutex
	startedAt time.Time
	requests  map[key]*observation
}

func New() *Registry {
	return &Registry{
		startedAt: time.Now(),
		requests:  make(map[key]*observation),
	}
}

type statusWriter struct {
	http.ResponseWriter
	status int
	wrote  bool
}

func (w *statusWriter) WriteHeader(status int) {
	if w.wrote {
		return
	}
	w.status = status
	w.wrote = true
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusWriter) Write(p []byte) (int, error) {
	if !w.wrote {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(p)
}

// Unwrap lets http.ResponseController access the original writer when needed.
func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (r *Registry) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		// Scrapes themselves are intentionally excluded to avoid self-generated
		// traffic obscuring the application request rate.
		if req.URL.Path == "/metrics" {
			next.ServeHTTP(w, req)
			return
		}

		started := time.Now()
		recorder := &statusWriter{ResponseWriter: w}
		next.ServeHTTP(recorder, req)
		status := recorder.status
		if status == 0 {
			status = http.StatusOK
		}

		method := normalizeMethod(req.Method)
		route := req.Pattern
		if route == "" {
			route = "unmatched"
		} else if space := strings.IndexByte(route, ' '); space >= 0 {
			route = route[space+1:]
		}
		r.observe(key{method: method, route: route, status: strconv.Itoa(status)}, time.Since(started).Seconds())
	})
}

func normalizeMethod(method string) string {
	switch method {
	case http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions, http.MethodHead:
		return method
	default:
		return "OTHER"
	}
}

func (r *Registry) observe(k key, seconds float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	o := r.requests[k]
	if o == nil {
		o = &observation{buckets: make([]uint64, len(histogramBounds))}
		r.requests[k] = o
	}
	o.count++
	o.sum += seconds
	for i, bound := range histogramBounds {
		if seconds <= bound {
			o.buckets[i]++
		}
	}
}

func (r *Registry) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusOK)

		r.mu.RLock()
		keys := make([]key, 0, len(r.requests))
		copyOf := make(map[key]observation, len(r.requests))
		for k, value := range r.requests {
			keys = append(keys, k)
			copyOf[k] = observation{
				count:   value.count,
				sum:     value.sum,
				buckets: append([]uint64(nil), value.buckets...),
			}
		}
		startedAt := r.startedAt
		r.mu.RUnlock()

		sort.Slice(keys, func(i, j int) bool {
			a, b := keys[i], keys[j]
			if a.route != b.route {
				return a.route < b.route
			}
			if a.method != b.method {
				return a.method < b.method
			}
			return a.status < b.status
		})

		fmt.Fprintln(w, "# HELP inomecops_up Whether the Inomecops HTTP server is serving metrics.")
		fmt.Fprintln(w, "# TYPE inomecops_up gauge")
		fmt.Fprintln(w, "inomecops_up 1")
		fmt.Fprintln(w, "# HELP inomecops_process_start_time_seconds Unix timestamp when the metrics registry was initialized.")
		fmt.Fprintln(w, "# TYPE inomecops_process_start_time_seconds gauge")
		fmt.Fprintf(w, "inomecops_process_start_time_seconds %.3f\n", float64(startedAt.UnixNano())/1e9)
		fmt.Fprintln(w, "# HELP inomecops_http_requests_total Total HTTP requests handled by method, route pattern and status.")
		fmt.Fprintln(w, "# TYPE inomecops_http_requests_total counter")
		fmt.Fprintln(w, "# HELP inomecops_http_request_duration_seconds HTTP request duration histogram in seconds.")
		fmt.Fprintln(w, "# TYPE inomecops_http_request_duration_seconds histogram")

		for _, k := range keys {
			o := copyOf[k]
			labels := fmt.Sprintf(`method="%s",route="%s",status="%s"`, promEscape(k.method), promEscape(k.route), promEscape(k.status))
			fmt.Fprintf(w, "inomecops_http_requests_total{%s} %d\n", labels, o.count)
			for i, bound := range histogramBounds {
				fmt.Fprintf(w, "inomecops_http_request_duration_seconds_bucket{%s,le=%q} %d\n", labels, strconv.FormatFloat(bound, 'f', -1, 64), o.buckets[i])
			}
			fmt.Fprintf(w, "inomecops_http_request_duration_seconds_bucket{%s,le=\"+Inf\"} %d\n", labels, o.count)
			fmt.Fprintf(w, "inomecops_http_request_duration_seconds_sum{%s} %.9f\n", labels, o.sum)
			fmt.Fprintf(w, "inomecops_http_request_duration_seconds_count{%s} %d\n", labels, o.count)
		}
	})
}

func promEscape(value string) string {
	value = strings.ReplaceAll(value, "\\", "\\\\")
	value = strings.ReplaceAll(value, "\"", "\\\"")
	return strings.ReplaceAll(value, "\n", "\\n")
}
