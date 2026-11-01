cmake_minimum_required(VERSION 3.15)
project(HybridNumericalSystem)

set(CMAKE_CXX_STANDARD 17)

# Locates Crow inside the vcpkg directories
find_package(Crow CONFIG REQUIRED)

add_executable(web_calculator main.cpp)

# Links the compiled executable to the Crow components
target_link_libraries(web_calculator PRIVATE Crow::Crow)
