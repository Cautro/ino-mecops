package metrics

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMiddlewareExposesRequestCounterAndHistogram(t *testing.T) {
	registry := New()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("POST /fail", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "failed", http.StatusInternalServerError)
	})
	handler := registry.Middleware(mux)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if response.Code != http.StatusNoContent {
		t.Fatalf("expected endpoint status 204, got %d", response.Code)
	}
	errorResponse := httptest.NewRecorder()
	handler.ServeHTTP(errorResponse, httptest.NewRequest(http.MethodPost, "/fail", nil))
	if errorResponse.Code != http.StatusInternalServerError {
		t.Fatalf("expected endpoint status 500, got %d", errorResponse.Code)
	}

	metricsResponse := httptest.NewRecorder()
	registry.Handler().ServeHTTP(metricsResponse, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body, err := io.ReadAll(metricsResponse.Result().Body)
	if err != nil {
		t.Fatal(err)
	}
	text := string(body)
	if !strings.Contains(text, `inomecops_http_requests_total{method="GET",route="/healthz",status="204"} 1`) {
		t.Fatalf("request counter not found in metrics: %s", text)
	}
	if !strings.Contains(text, `inomecops_http_request_duration_seconds_bucket`) {
		t.Fatalf("histogram buckets not found in metrics: %s", text)
	}
	if !strings.Contains(text, `inomecops_http_errors_total{method="POST",route="/fail",status="500"} 1`) {
		t.Fatalf("error counter not found in metrics: %s", text)
	}
}
