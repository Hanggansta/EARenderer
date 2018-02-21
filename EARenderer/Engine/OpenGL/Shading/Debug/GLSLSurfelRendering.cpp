//
//  GLSLTriangleRendering.cpp
//  EARenderer
//
//  Created by Pavlo Muratov on 30.12.2017.
//  Copyright © 2017 MPO. All rights reserved.
//

#include "GLSLSurfelRendering.hpp"

namespace EARenderer {
    
#pragma mark - Lifecycle
    
    GLSLSurfelRendering::GLSLSurfelRendering()
    :
    GLProgram("SurfelRendering.vert", "SurfelRendering.frag", "SurfelRendering.geom")
    { }

#pragma mark - Setters

    void GLSLSurfelRendering::setViewProjectionMatrix(const glm::mat4 &mvp) {
        glUniformMatrix4fv(uniformByNameCRC32(ctcrc32("uViewProjectionMatrix")).location(), 1, GL_FALSE, glm::value_ptr(mvp));
    }

    void GLSLSurfelRendering::setSurfelRadius(float radius) {
        glUniform1f(uniformByNameCRC32(ctcrc32("uRadius")).location(), radius);
    }
    
}