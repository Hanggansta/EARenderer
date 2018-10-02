//
//  Color.cpp
//  EARenderer
//
//  Created by Pavlo Muratov on 08.07.17.
//  Copyright © 2017 MPO. All rights reserved.
//

#include "Color.hpp"

#include <glm/detail/func_exponential.hpp>

namespace EARenderer {
    
#pragma mark - Singletons
    
    const Color& Color::white() {
        static Color white(1.0, 1.0);
        return white;
    }
    
    const Color& Color::black() {
        static Color black(0.0, 1.0);
        return black;
    }
    
    const Color& Color::gray() {
        static Color gray(0.3, 1.0);
        return gray;
    }
    
    const Color& Color::red() {
        static Color red(1.0, 0.0, 0.0, 1.0);
        return red;
    }
    
    const Color& Color::blue() {
        static Color blue(0.0, 0.0, 1.0, 1.0);
        return blue;
    }
    
    const Color& Color::green() {
        static Color green(0.0, 1.0, 0.0, 1.0);
        return green;
    }
    
#pragma mark - Lifecycle
    
    Color::Color(float red, float green, float blue, float alpha)
    :
    r(red),
    g(green),
    b(blue),
    a(alpha)
    { }

    Color::Color(float red, float green, float blue)
    :
    r(red),
    g(green),
    b(blue),
    a(1.0)
    { }
    
    Color::Color(float white, float alpha)
    :
    r(white),
    g(white),
    b(white),
    a(alpha)
    { }
    
#pragma mark - Getters
    
    glm::vec3 Color::rgb() const {
        return { r, g, b };
    }
    
    glm::vec4 Color::rgba() const {
        return { r, g, b, a };
    }

    Color Color::YCoCg() const {
        float Co = (r - b) / 2.0;
        float t = b + Co;
        float Cg = (g - t) / 2.0;
        float Y = t + Cg;
        return { Y, Co, Cg };
    }

    Color Color::linear() const {
        glm::vec3 linearRGB = glm::pow(rgb(), glm::vec3(2.2));
        return { linearRGB.r, linearRGB.g, linearRGB.b, a };
    }
    
}
