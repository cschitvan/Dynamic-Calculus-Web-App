#include "crow.h"
#include <vector>
#include <cmath>
#include <string>
#include <sstream>

double calculateHybridArea(const std::vector<double>& y, double h) {
    size_t n = y.size() - 1;          // number of intervals (y.size() >= 2 guaranteed by caller)
    double totalArea = 0.0;
    size_t i = 0;

    // Simpson's 3/8 rule on blocks of 3 intervals
    while ((n - i) >= 3) {
        totalArea += (3.0 * h / 8.0) * (y[i] + 3.0 * y[i + 1] + 3.0 * y[i + 2] + y[i + 3]);
        i += 3;
    }
    // Simpson's 1/3 rule on blocks of 2 intervals
    while ((n - i) >= 2) {
        totalArea += (h / 3.0) * (y[i] + 4.0 * y[i + 1] + y[i + 2]);
        i += 2;
    }
    // Trapezoidal rule for any leftover interval
    while ((n - i) >= 1) {
        totalArea += (h / 2.0) * (y[i] + y[i + 1]);
        i += 1;
    }
    return totalArea;
}

static crow::response jsonError(int code, const std::string& message) {
    crow::json::wvalue err;
    err["error"] = message;
    crow::response res(code, err.dump());
    res.set_header("Content-Type", "application/json");
    return res;
}

int main() {
    crow::SimpleApp app;

    CROW_ROUTE(app, "/")([]() {
        crow::response res(crow::mustache::load_text("index.html"));
        res.set_header("Content-Type", "text/html; charset=utf-8");
        return res;
    });

    CROW_ROUTE(app, "/api/calculate").methods(crow::HTTPMethod::POST)([](const crow::request& req) {
        auto body = crow::json::load(req.body);
        if (!body || !body.has("raw_y") || !body.has("h")) {
            return jsonError(400, "Invalid JSON data.");
        }

        // raw_y must be a string of comma-separated values
        if (body["raw_y"].t() != crow::json::type::String) {
            return jsonError(400, "raw_y must be a string.");
        }
        std::string raw_y_str = body["raw_y"].s();

        // h may arrive as a string ("1.0") or a number (1.0)
        double h = 0.0;
        try {
            if (body["h"].t() == crow::json::type::String) {
                h = std::stod(body["h"].s());
            } else if (body["h"].t() == crow::json::type::Number) {
                h = body["h"].d();
            } else {
                return jsonError(400, "h must be a number.");
            }
        } catch (...) {
            return jsonError(400, "Could not parse step size h.");
        }
        if (!(h > 0.0)) {
            return jsonError(400, "Step size h must be greater than 0.");
        }

        std::vector<double> y_values;
        std::stringstream ss(raw_y_str);
        std::string token;
        while (std::getline(ss, token, ',')) {
            try {
                if (!token.empty()) y_values.push_back(std::stod(token));
            } catch (...) {}
        }

        if (y_values.size() < 2) {
            return jsonError(400, "Requires at least 2 valid coordinates.");
        }

        double area = calculateHybridArea(y_values, h);

        crow::json::wvalue response_data;
        response_data["area"]   = area;
        response_data["slices"] = static_cast<int>(y_values.size() - 1);
        response_data["points"] = static_cast<int>(y_values.size());

        crow::response res(response_data.dump());
        res.set_header("Content-Type", "application/json");
        return res;
    });

    app.port(18080).multithreaded().run();
}